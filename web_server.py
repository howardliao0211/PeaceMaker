#!/usr/bin/env python3
"""
PeaceMaker Web Server
Serves the web UI and integrates with the existing backend
"""

import os
import asyncio
import json
import time
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
import uvicorn
from logger import getLogger

# Import your existing backend
from main import GeminiHandler, Stream

logger = getLogger("web_server")

app = FastAPI(
    title="PeaceMaker Web Server",
    description="Real-time audio-video communication with AI features",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files (UI)
ui_path = Path(__file__).parent / "ui"
build_path = ui_path / "build"

# Mount the React build directory as static files
if build_path.exists():
    # Mount static assets at /static path for React app
    app.mount("/static", StaticFiles(directory=str(build_path)), name="static")
    logger.info(f"Mounted React build directory: {build_path}")
else:
    logger.warning(f"React build directory not found: {build_path}")
    
    # For development, serve the public directory
    public_path = ui_path / "public"
    if public_path.exists():
        app.mount("/static", StaticFiles(directory=str(public_path)), name="static")
        logger.info(f"Mounted UI public directory: {public_path}")

# WebSocket connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.handlers: Dict[str, GeminiHandler] = {}

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.active_connections.append(websocket)
        
        # Create a new handler for this session
        handler = GeminiHandler()
        self.handlers[session_id] = handler
        
        logger.info(f"🔌 WebSocket client connected: {session_id}")
        logger.info(f"📊 Total active connections: {len(self.active_connections)}")
        
        await websocket.send_text(json.dumps({
            "type": "connection",
            "status": "connected",
            "session_id": session_id
        }))

    def disconnect(self, websocket: WebSocket, session_id: str):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        
        if session_id in self.handlers:
            del self.handlers[session_id]
        
        logger.info(f"Client disconnected: {session_id}")

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        logger.info(f"📡 Broadcasting message to {len(self.active_connections)} connections")
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
                logger.info(f"✅ Message sent to connection")
            except Exception as e:
                logger.error(f"❌ Failed to send message: {e}")
                # Remove dead connections
                self.active_connections.remove(connection)

manager = ConnectionManager()

# Data models
class TranscriptionData(BaseModel):
    text: str
    confidence: float
    timestamp: float  # Changed from str to float to match main.py

class SentimentData(BaseModel):
    label: str
    score: float
    confidence: float
    timestamp: float  # Changed from str to float to match main.py

class AudioSettings(BaseModel):
    sample_rate: int = 24000
    vad_threshold: float = 0.2
    echo_cancellation: bool = True
    noise_suppression: bool = True

# Routes
# The React app is now served directly by StaticFiles mount
# No need for custom route handler

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "PeaceMaker Web Server"}

@app.get("/api/devices")
async def get_devices():
    """Get available audio/video devices (placeholder)"""
    return {
        "audio_inputs": [
            {"id": "default", "name": "Default Microphone"},
            {"id": "external", "name": "External Microphone"}
        ],
        "audio_outputs": [
            {"id": "default", "name": "Default Speakers"},
            {"id": "headphones", "name": "Headphones"}
        ],
        "video_inputs": [
            {"id": "default", "name": "Default Camera"},
            {"id": "external", "name": "External Camera"}
        ]
    }

@app.post("/api/settings/audio")
async def update_audio_settings(settings: AudioSettings):
    """Update audio settings"""
    logger.info(f"Audio settings updated: {settings}")
    return {"status": "success", "settings": settings}

@app.post("/api/transcription")
async def add_transcription(data: TranscriptionData):
    """Add transcription data"""
    logger.info(f"Transcription received: {data.text}")
    
    # Convert timestamp to readable format for frontend
    frontend_data = {
        "text": data.text,
        "confidence": data.confidence,
        "timestamp": time.strftime("%H:%M:%S", time.localtime(data.timestamp))
    }
    
    # Broadcast to all connected clients
    await manager.broadcast(json.dumps({
        "type": "transcription",
        "data": frontend_data
    }))
    
    return {"status": "success"}

@app.post("/api/sentiment")
async def add_sentiment(data: SentimentData):
    """Add sentiment analysis data"""
    logger.info(f"Sentiment received: {data.label} ({data.score})")
    
    # Convert timestamp to readable format for frontend
    frontend_data = {
        "label": data.label,
        "score": data.score,
        "confidence": data.confidence,
        "timestamp": time.strftime("%H:%M:%S", time.localtime(data.timestamp))
    }
    
    # Broadcast to all connected clients
    await manager.broadcast(json.dumps({
        "type": "sentiment",
        "data": frontend_data
    }))
    
    return {"status": "success"}

# WebSocket endpoint for real-time communication
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(websocket, session_id)
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)
            
            logger.info(f"Received from {session_id}: {message}")
            
            # Handle different message types
            if message["type"] == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
            
            elif message["type"] == "audio_settings":
                # Update audio settings
                settings = AudioSettings(**message["data"])
                await manager.send_personal_message(
                    json.dumps({
                        "type": "settings_updated",
                        "status": "success"
                    }),
                    websocket
                )
            
            elif message["type"] == "get_status":
                # Send current status
                await manager.send_personal_message(
                    json.dumps({
                        "type": "status",
                        "connected": True,
                        "session_id": session_id
                    }),
                    websocket
                )
            
            elif message["type"] == "audio_data":
                # Handle incoming audio data
                audio_data = message.get("data", {})
                logger.info(f"Received audio data from {session_id}: {len(audio_data.get('audio', ''))} bytes")
                
                # Process audio data (placeholder for STT integration)
                # Here you would integrate with your existing audio processing
                
                # Send acknowledgment
                await manager.send_personal_message(
                    json.dumps({
                        "type": "audio_received",
                        "status": "success",
                        "timestamp": audio_data.get("timestamp")
                    }),
                    websocket
                )
            
            elif message["type"] == "video_frame":
                # Handle incoming video frame
                video_data = message.get("data", {})
                logger.info(f"Received video frame from {session_id}: {video_data.get('metadata', {}).get('width', 0)}x{video_data.get('metadata', {}).get('height', 0)}")
                
                # Process video frame (placeholder for video analysis)
                # Here you would integrate with your existing video processing
                
                # Send acknowledgment
                await manager.send_personal_message(
                    json.dumps({
                        "type": "video_received",
                        "status": "success",
                        "timestamp": video_data.get("timestamp")
                    }),
                    websocket
                )
            
            elif message["type"] == "control":
                # Handle control commands
                control_data = message.get("data", {})
                command = control_data.get("command")
                
                logger.info(f"Received control command from {session_id}: {command}")
                
                if command == "start_recording":
                    # Start recording session
                    try:
                        # Here you would integrate with your existing Stream setup
                        await manager.send_personal_message(
                            json.dumps({
                                "type": "control_response",
                                "command": command,
                                "status": "success",
                                "message": "Recording started"
                            }),
                            websocket
                        )
                    except Exception as e:
                        await manager.send_personal_message(
                            json.dumps({
                                "type": "control_response",
                                "command": command,
                                "status": "error",
                                "message": str(e)
                            }),
                            websocket
                        )
                
                elif command == "stop_recording":
                    # Stop recording session
                    try:
                        # Here you would stop your existing Stream
                        await manager.send_personal_message(
                            json.dumps({
                                "type": "control_response",
                                "command": command,
                                "status": "success",
                                "message": "Recording stopped"
                            }),
                            websocket
                        )
                    except Exception as e:
                        await manager.send_personal_message(
                            json.dumps({
                                "type": "control_response",
                                "command": command,
                                "status": "error",
                                "message": str(e)
                            }),
                            websocket
                        )
                
                elif command == "start_ai_session":
                    # Start AI backend session
                    try:
                        # Here you would start your existing GeminiHandler
                        await manager.send_personal_message(
                            json.dumps({
                                "type": "control_response",
                                "command": command,
                                "status": "success",
                                "message": "AI session started"
                            }),
                            websocket
                        )
                    except Exception as e:
                        await manager.send_personal_message(
                            json.dumps({
                                "type": "control_response",
                                "command": command,
                                "status": "error",
                                "message": str(e)
                            }),
                            websocket
                        )
                
                elif command == "stop_ai_session":
                    # Stop AI backend session
                    try:
                        # Here you would stop your existing GeminiHandler
                        await manager.send_personal_message(
                            json.dumps({
                                "type": "control_response",
                                "command": command,
                                "status": "success",
                                "message": "AI session stopped"
                            }),
                            websocket
                        )
                    except Exception as e:
                        await manager.send_personal_message(
                            json.dumps({
                                "type": "control_response",
                                "command": command,
                                "status": "error",
                                "message": str(e)
                            }),
                            websocket
                        )
                
                else:
                    # Unknown command
                    await manager.send_personal_message(
                        json.dumps({
                            "type": "control_response",
                            "command": command,
                            "status": "error",
                            "message": f"Unknown command: {command}"
                        }),
                        websocket
                    )
            
            elif message["type"] == "audio_settings":
                # Handle audio settings update
                settings_data = message.get("data", {})
                logger.info(f"Audio settings updated for {session_id}: {settings_data}")
                
                # Here you would update your audio processing settings
                
                await manager.send_personal_message(
                    json.dumps({
                        "type": "settings_updated",
                        "status": "success",
                        "message": "Audio settings updated"
                    }),
                    websocket
                )
            
            elif message["type"] == "mute":
                logger.info(f"WebSocket mute command from {session_id}")
                # Call the mute function from GeminiHandler
                handler = manager.handlers.get(session_id)
                if handler:
                    handler.mute()
                    await manager.send_personal_message(
                        json.dumps({
                            "type": "mute_response",
                            "status": "success",
                            "message": "Audio muted"
                        }),
                        websocket
                    )
                else:
                    await manager.send_personal_message(
                        json.dumps({
                            "type": "mute_response",
                            "status": "error",
                            "message": "No handler found for session"
                        }),
                        websocket
                    )
            
            elif message["type"] == "unmute":
                logger.info(f"WebSocket unmute command from {session_id}")
                # Call the unmute function from GeminiHandler
                handler = manager.handlers.get(session_id)
                if handler:
                    handler.unmute()
                    await manager.send_personal_message(
                        json.dumps({
                            "type": "unmute_response",
                            "status": "success",
                            "message": "Audio unmuted"
                        }),
                        websocket
                    )
                else:
                    await manager.send_personal_message(
                        json.dumps({
                            "type": "unmute_response",
                            "status": "error",
                            "message": "No handler found for session"
                        }),
                        websocket
                    )
            
            elif message["type"] == "get_chat_suggestions":
                logger.info(f"WebSocket get_chat_suggestions command from {session_id}")
                # Call the getChatSuggestion function from GeminiHandler
                handler = manager.handlers.get(session_id)
                if handler:
                    suggestions = handler.getChatSuggestion()
                    await manager.send_personal_message(
                        json.dumps({
                            "type": "topic_suggestions",
                            "status": "success",
                            "data": suggestions
                        }),
                        websocket
                    )
                else:
                    await manager.send_personal_message(
                        json.dumps({
                            "type": "topic_suggestions",
                            "status": "error",
                            "message": "No handler found for session"
                        }),
                        websocket
                    )
            
            # Add more message handlers as needed
            
    except WebSocketDisconnect:
        manager.disconnect(websocket, session_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket, session_id)

# API endpoints for backend integration
@app.post("/api/backend/start")
async def start_backend_session():
    """Start a new backend session"""
    try:
        # This would integrate with your existing Stream setup
        # For now, return success
        return {
            "status": "success",
            "message": "Backend session started",
            "session_id": "demo_session"
        }
    except Exception as e:
        logger.error(f"Error starting backend session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/backend/stop")
async def stop_backend_session():
    """Stop the current backend session"""
    try:
        # This would stop your existing Stream
        return {
            "status": "success",
            "message": "Backend session stopped"
        }
    except Exception as e:
        logger.error(f"Error stopping backend session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/backend/status")
async def get_backend_status():
    """Get backend status"""
    try:
        # This would check your existing Stream status
        return {
            "status": "running",
            "handler_type": "GeminiHandler",
            "modality": "audio-video",
            "mode": "send-receive"
        }
    except Exception as e:
        logger.error(f"Error getting backend status: {e}")
        return {"status": "error", "error": str(e)}

# Error handlers
@app.exception_handler(404)
async def not_found_handler(request, exc):
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=404,
        content={"error": "Not found", "path": str(request.url.path)}
    )

@app.exception_handler(500)
async def internal_error_handler(request, exc):
    from fastapi.responses import JSONResponse
    logger.error(f"Internal server error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"}
    )

# Main function
def main():
    """Run the web server"""
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    
    logger.info(f"Starting PeaceMaker Web Server on {host}:{port}")
    logger.info("Make sure to also run 'python main.py' in another terminal for the Gradio interface")
    
    uvicorn.run(
        "web_server:app",
        host=host,
        port=port,
        reload=True,  # Enable auto-reload for development
        log_level="info"
    )

# Only run main when script is executed directly
if __name__ == "__main__":
    main()
