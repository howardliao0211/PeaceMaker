# backend.py
from fastapi import FastAPI, WebSocket
from fastrtc import Stream
from logger import getLogger
import uvicorn
import json

app = FastAPI()
logger = getLogger("backend")

# Create a bidirectional video stream (no processing)
stream = Stream(
    handler=lambda frame: frame,  # Just pass frames through
    modality="video",
    mode="send-receive"
)

# Mount WebRTC endpoint
stream.mount(app, path="/webrtc")

# Store signaling info for the "room"
rooms = {}  # { room_id: {"offer": None, "answer": None, "candidates": []} }
connections = {}  # Map websocket to room_id and role ("caller"/"callee")

@app.websocket("/signal/{room_id}")
async def signaling(websocket: WebSocket, room_id: str):
    await websocket.accept()
    role = None

    # Create room if not exists
    if room_id not in rooms:
        rooms[room_id] = {"offer": None, "answer": None, "candidates": []}

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            logger.debug(f'msg: {msg}')

            if msg["type"] == "offer":
                rooms[room_id]["offer"] = msg
                role = "caller"
                connections[websocket] = (room_id, role)

            elif msg["type"] == "get-offer":
                if rooms[room_id]["offer"]:
                    await websocket.send_text(json.dumps(rooms[room_id]["offer"]))
                    role = "callee"
                    connections[websocket] = (room_id, role)
                else:
                    await websocket.send_text(json.dumps({"type": "no-offer"}))

            elif msg["type"] == "answer":
                rooms[room_id]["answer"] = msg
                # Send answer to the caller
                for ws, (rid, rrole) in connections.items():
                    if rid == room_id and rrole == "caller":
                        await ws.send_text(json.dumps(msg))

            elif msg["type"] == "candidate":
                # Store candidate
                rooms[room_id]["candidates"].append(msg)
                # Forward candidate to the other peer
                for ws, (rid, rrole) in connections.items():
                    if rid == room_id and rrole != role:
                        await ws.send_text(json.dumps(msg))

    except Exception:
        pass
    finally:
        if websocket in connections:
            del connections[websocket]

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
