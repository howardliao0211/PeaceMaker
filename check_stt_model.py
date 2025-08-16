from fastrtc import Stream, ReplyOnPause, get_stt_model
import numpy as np
import time

sst_model = get_stt_model()

def echo(audio: tuple[int, np.ndarray]):
    # The function will be passed the audio until the user pauses
    # Implement any iterator that yields audio
    # See "LLM Voice Chat" for a more complete example
    start = time.time()
    text = sst_model.stt(audio)
    print("transcription", time.time() - start)
    print("prompt", text)
    yield audio

stream = Stream(
    handler=ReplyOnPause(echo),
    modality="audio", 
    mode="send-receive",
)

stream.ui.launch()

