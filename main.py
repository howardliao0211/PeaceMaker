from fastrtc import Stream, AsyncAudioVideoStreamHandler, VideoEmitType, wait_for_item
from fastrtc.utils import AdditionalOutputs
from transformers import pipeline
from PIL import Image
from io import BytesIO
from logger import getLogger
import queue
import torch
import numpy as np
import time
import base64
import asyncio

logger = getLogger("main")
AUDIO_PRETRAINED = "openai/whisper-base"

class GeminiHandler(AsyncAudioVideoStreamHandler):
    def __init__(
        self,
    ) -> None:
        super().__init__(
            "mono",
            output_sample_rate=24000,
            input_sample_rate=24000,
        )
        self.audio_queue = asyncio.Queue()
        self.video_queue = asyncio.Queue()
        self.last_frame_time = 0
        self.quit = asyncio.Event()

        self.speech2text = pipeline(model=AUDIO_PRETRAINED)

    def copy(self) -> "GeminiHandler":
        return GeminiHandler()

    async def start_up(self):
        pass

    async def video_receive(self, frame: np.ndarray):
        # do not need to process video frame. 
        self.video_queue.put_nowait(frame)

    async def video_emit(self) -> VideoEmitType:
        frame = await self.video_queue.get()
        return frame, AdditionalOutputs()

    async def receive(self, frame: tuple[int, np.ndarray]) -> None:
        # convert audio to text
        sampling_rate, array = frame
        self.audio_queue.put_nowait(array)

    async def emit(self):
        array = await wait_for_item(self.audio_queue)
        return self.output_sample_rate, array

    async def shutdown(self) -> None:
        pass

handler = GeminiHandler()

stream = Stream(
    handler=handler,
    modality="audio-video",
    mode="send-receive",
)

stream.ui.launch()
