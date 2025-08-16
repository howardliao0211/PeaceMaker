from fastrtc import (
    Stream,
    AsyncAudioVideoStreamHandler,
    VideoEmitType,
    wait_for_item,
    ReplyOnPause,
    get_stt_model
)
from fastrtc.reply_on_pause import get_silero_model, ModelOptions  # type: ignore
from fastrtc.utils import AdditionalOutputs
from transformers import pipeline
from PIL import Image
from io import BytesIO
from logger import getLogger
import contextlib
from typing import Tuple, Optional, Callable, Awaitable
from dataclasses import dataclass
import queue
import torch
import numpy as np
import time
import base64
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
        return frame, AdditionalOutputs()

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
        return self.output_sample_rate, audio

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
        t0 = time.time()
        try:
            text = await asyncio.to_thread(self.stt_model.stt, (fs, utter_1xN))
        except Exception as e:
            logger.error(f'[STT error: {e}]')
        logger.info(f"[STT] {time.time() - t0:.3f}s: {text}")
        
        if len(text.split()) > 3:
            t0 = time.time()
            result = await asyncio.to_thread(self.sentiment_analysis, [text])
            logger.info(f"[SA] {time.time() - t0:.3f}s: {result}")


handler = GeminiHandler()

stream = Stream(
    handler=handler,
    modality="audio-video",
    mode="send-receive",
)

stream.ui.launch()
