from fastrtc import (
    Stream,
    AsyncAudioVideoStreamHandler,
    VideoEmitType,
    wait_for_item,
    ReplyOnPause,
    get_stt_model,
    WebRTC
)
from fastrtc.reply_on_pause import get_silero_model, ModelOptions  # type: ignore
from fastrtc.utils import AdditionalOutputs
from transformers import pipeline
from logger import getLogger
from typing import Tuple, Optional
from dataclasses import dataclass
import gradio as gr
import numpy as np
import time
import asyncio

logger = getLogger("main")

@dataclass
class VadConfig:
    # Analyze buffer only when it has at least this much audio
    audio_chunk_duration: float = 0.6      # seconds
    # If voiced duration in a buffer exceeds this, mark "started_talking"
    started_talking_threshold: float = 0.20 # seconds
    # If voiced duration in a buffer falls below this (after talking started), treat as pause
    speech_threshold: float = 0.1          # seconds
    # Cut long monologues
    max_continuous_speech_s: float = 12.0
    # If a new utterance starts while STT is running, interrupt the old one
    can_interrupt: bool = True

class GeminiHandler(AsyncAudioVideoStreamHandler):
    def __init__(self) -> None:
        super().__init__(
            "mono",
            output_sample_rate=24000,
            input_sample_rate=24000,
        )
        # passthrough queues for AV
        self.audio_queue: asyncio.Queue[np.ndarray] = asyncio.Queue(maxsize=8)
        self.video_queue: asyncio.Queue[np.ndarray] = asyncio.Queue(maxsize=8)

        # STT + VAD
        self.stt_model = get_stt_model()
        self.vad_model = get_silero_model()
        self.vad_cfg = VadConfig()
        self.vad_opts: Optional[ModelOptions] = None  # plug in if you have specific options

        # VAD state (minimal AppState)
        self._sampling_rate: Optional[int] = None
        self._started_talking: bool = False
        self._buffer: Optional[np.ndarray] = None   # grows until analyzed
        self._stream: Optional[np.ndarray] = None   # accumulated utterance (1-D)

        # Background STT task for current utterance
        self._stt_task: Optional[asyncio.Task] = None

        # pipeline for sentiment analysis
        self.sentiment_analysis = pipeline("text-classification")

        # ---------- Only what the UI needs ----------
        self.argue_score: float = 0.0              # [0..1]
        self.last_sentiment: dict = {} # e.g. {"label":"NEGATIVE","score":0.92}
        self.convo_history: list[str] = []
        # -------------------------------------------

    def copy(self) -> "GeminiHandler":
        return GeminiHandler()

    # ---------------- lifecycle ----------------

    async def start_up(self):
        pass

    async def shutdown(self) -> None:
        if self._stt_task and not self._stt_task.done():
            self._stt_task.cancel()
            try:
                await self._stt_task
            except Exception:
                pass

    # ---------------- VIDEO passthrough ----------------

    async def video_receive(self, frame: np.ndarray):
        try:
            self.video_queue.put_nowait(frame)
        except asyncio.QueueFull:
            # drop oldest to keep real-time
            try:
                _ = self.video_queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            self.video_queue.put_nowait(frame)

    async def video_emit(self):
        frame = await self.video_queue.get()
        return frame, AdditionalOutputs(self.argue_score, self.last_sentiment, self.convo_history)

    # ---------------- AUDIO ----------------

    async def receive(self, frame: Tuple[int, np.ndarray]) -> None:
        fs, audio = frame

        # 1) Pass through audio for playback (non-blocking; drop oldest if congested)
        try:
            self.audio_queue.put_nowait(audio)
        except asyncio.QueueFull:
            try:
                _ = self.audio_queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            self.audio_queue.put_nowait(audio)

        # 2) Pause/VAD logic (mirrors ReplyOnPause.determine_pause/process_audio)
        x = np.squeeze(np.asarray(audio))
        if self._sampling_rate is None:
            self._sampling_rate = fs

        # Append to buffer (for VAD analysis)
        if self._buffer is None:
            self._buffer = x
        else:
            self._buffer = np.concatenate((self._buffer, x))

        # Only analyze when buffer has enough duration
        if self._buffer.size / fs >= self.vad_cfg.audio_chunk_duration:
            dur_vad, _ = self.vad_model.vad((fs, self._buffer), self.vad_opts)
            # mark started talking
            logger.debug(f'dur_vad {dur_vad}. thr: {self.vad_cfg.started_talking_threshold}')
            if dur_vad > self.vad_cfg.started_talking_threshold and not self._started_talking:
                self._started_talking = True
                # move buffer into stream
                self._stream = self._buffer.copy() if self._stream is None \
                               else np.concatenate((self._stream, self._buffer))
                self._buffer = None
                return  # wait for next buffer

            pause = False
            if self._started_talking:
                # accumulate speech into stream
                self._stream = self._buffer.copy() if self._stream is None \
                               else np.concatenate((self._stream, self._buffer))
                self._buffer = None

                # max continuous speech guard
                if self._stream.size / fs >= self.vad_cfg.max_continuous_speech_s:
                    pause = True

                # silence after speech → pause
                if dur_vad < self.vad_cfg.speech_threshold:
                    pause = True

                if pause:
                    # snapshot utterance (1, N) for STT and reset state
                    utter = self._stream.reshape(1, -1)
                    sfs = self._sampling_rate or fs
                    self._reset_vad_state()
                    self._trigger_stt(sfs, utter)

            else:
                # not started_talking yet; clear buffer to slide the window
                self._buffer = None

    async def emit(self):
        audio = await self.audio_queue.get()
        audio = np.asarray(audio)
        if audio.ndim > 1:
            audio = audio.reshape(-1)
        return (self.output_sample_rate, audio), AdditionalOutputs(self.argue_score, self.last_sentiment, self.convo_history)

    # ---------------- helpers ----------------

    def _reset_vad_state(self):
        self._started_talking = False
        self._buffer = None
        self._stream = None
        # keep _sampling_rate for future frames

    def _trigger_stt(self, fs: int, utter_1xN: np.ndarray):
        """
        Run STT in the background. If an STT task is running and can_interrupt=True, cancel it.
        """
        if self._stt_task and not self._stt_task.done() and self.vad_cfg.can_interrupt:
            self._stt_task.cancel()
        self._stt_task = asyncio.create_task(self._run_stt(fs, utter_1xN))

    async def _run_stt(self, fs: int, utter_1xN: np.ndarray):
        """
        Off-loop STT so streaming is never blocked.
        """
        try:
            text = await asyncio.to_thread(self.stt_model.stt, (fs, utter_1xN))
        except Exception as e:
            logger.error(f'[STT error: {e}]')
        
        self.convo_history.append(text)
        
        if len(text.split()) > 3:
            try:
                result = await asyncio.to_thread(self.sentiment_analysis, [text])
            except Exception as e:
                logger.error(f'[SA error: {e}]')
            
            self.last_sentiment = result
            lbl = str(self.last_sentiment.get("label", "")).upper()
            sc  = float(self.last_sentiment.get("score", 0.0))
            # Simple mapping: strong NEG drives the overlay, POS weakly affects it
            self.argue_score = sc if "NEG" in lbl else sc * 0.3
        else:
            self.argue_score = float(max(0.0, self.argue_score - 0.05))


# ui.py
import gradio as gr
from typing import List

def _overlay_html(alpha: float) -> str:
    a = max(0.0, min(1.0, float(alpha or 0.0)))
    return f"""
    <div id="argue-tint"
         style="position:fixed; inset:0; background:rgba(255,0,0,{a});
                pointer-events:none; transition:background 500ms ease; z-index:9999;"></div>
    """

def update_screen_tint(argue_score: float) -> str:
    return _overlay_html(argue_score)

def render_history_md(history: List[str]) -> str:
    if not history:
        return "### 🗂️ Conversation History\n_No conversation yet._"
    items = list(reversed(history[-50:]))  # newest first
    safe = [str(t).replace("<", "&lt;").replace(">", "&gt;") for t in items]
    return "### 🗂️ Conversation History\n" + "\n".join(f"- {t}" for t in safe)

def get_chat_suggestions():
    return [
        "Acknowledge feelings before facts.",
        "Summarize: “Here’s what I’m hearing…”",
        "Ask one open question.",
        "Offer a brief pause/reset.",
    ]

stream = Stream(
    handler=GeminiHandler(),
    modality="audio-video",
    mode="send-receive",
)

CSS = """
/* Keep sidebar fixed as you scroll */
.sidebar { position: sticky; top: 12px; align-self: flex-start; }
/* Make the A/V panel clearly visible height-wise */
.webrtc-wrap { min-height: 420px; }
"""

with gr.Blocks(css=CSS) as demo:
    gr.HTML("<h1 style='text-align:center'>PeaceMaker ⚡️</h1>")
    overlay = gr.HTML(_overlay_html(0.0))

    with gr.Row() as row:
        # ===== Sidebar (history + suggestions) =====
        with gr.Column(scale=1, min_width=320, elem_classes=["sidebar"]):
            history_md = gr.Markdown(render_history_md([]))
            suggestions = gr.JSON(label="Suggestions")
            suggest_btn = gr.Button("Give Chat Suggestion", variant="primary")

        # ===== Main Area (single audio-video WebRTC) =====
        with gr.Column(scale=3):
            webrtc = WebRTC(                  # NOTE: using gradio's class alias import if your fastrtc exposes it like this
                label='Video',
                modality="audio-video",
                mode="send-receive",         # your build expects this spelling
            )
            sentiment = gr.JSON(label="Sentiment (latest)")

        webrtc.stream(
            GeminiHandler(),
            inputs=[webrtc],     # loopback so the remote video/audio renders here
            outputs=[webrtc],
        )

    # Hidden driver for the overlay alpha
    argue_score_state = gr.Number(value=0.0, visible=False, precision=3)

    # AdditionalOutputs -> (argue_score, last_sentiment, convo_history)
    def fanout(score: float, sa: dict, hist: list[str]):
        return score, sa, render_history_md(hist)

    # Subscribe ON THE SAME av component
    webrtc.on_additional_outputs(
        fanout,
        outputs=[argue_score_state, sentiment, history_md],
        queue=False,
        show_progress="hidden",
    )

    # Tint updates
    argue_score_state.change(update_screen_tint, inputs=argue_score_state, outputs=overlay)

    # Sidebar suggestions
    suggest_btn.click(get_chat_suggestions, None, suggestions)

stream.ui = demo

if __name__ == "__main__":
    stream.ui.launch(server_port=7860)
