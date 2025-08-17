#!/usr/bin/env python3
"""
PeaceMaker Backend Integration Script
Shows how to connect the web UI with the existing backend
"""

import asyncio
import json
import time
from typing import Dict, Any, Optional
from logger import getLogger

# Import your existing backend
from main import GeminiHandler, Stream

logger = getLogger("integration")

class BackendIntegration:
    """
    Integrates the web UI with the existing PeaceMaker backend
    """
    
    def __init__(self):
        self.handler: Optional[GeminiHandler] = None
        self.stream: Optional[Stream] = None
        self.is_running = False
        self.transcription_callback = None
        self.sentiment_callback = None
        
    async def start_backend(self) -> Dict[str, Any]:
        """Start the backend session"""
        try:
            logger.info("Starting PeaceMaker backend...")
            
            # Create handler instance
            self.handler = GeminiHandler()
            
            # Create stream (but don't launch UI)
            self.stream = Stream(
                handler=self.handler,
                modality="audio-video",
                mode="send-receive",
            )
            
            # Set up callbacks for real-time data
            self._setup_callbacks()
            
            self.is_running = True
            logger.info("Backend started successfully")
            
            return {
                "status": "success",
                "message": "Backend session started",
                "session_id": f"session_{int(time.time())}",
                "handler_type": "GeminiHandler",
                "modality": "audio-video",
                "mode": "send-receive"
            }
            
        except Exception as e:
            logger.error(f"Error starting backend: {e}")
            return {
                "status": "error",
                "error": str(e)
            }
    
    async def stop_backend(self) -> Dict[str, Any]:
        """Stop the backend session"""
        try:
            logger.info("Stopping PeaceMaker backend...")
            
            if self.handler:
                await self.handler.shutdown()
                self.handler = None
            
            if self.stream:
                # Clean up stream resources
                self.stream = None
            
            self.is_running = False
            logger.info("Backend stopped successfully")
            
            return {
                "status": "success",
                "message": "Backend session stopped"
            }
            
        except Exception as e:
            logger.error(f"Error stopping backend: {e}")
            return {
                "status": "error",
                "error": str(e)
            }
    
    def _setup_callbacks(self):
        """Set up callbacks to capture backend data"""
        if not self.handler:
            return
        
        # Override the STT method to capture transcription
        original_run_stt = self.handler._run_stt
        
        async def transcription_callback(fs: int, utter_1xN):
            """Capture transcription and send to frontend"""
            try:
                # Call original method
                result = await original_run_stt(fs, utter_1xN)
                
                # Extract transcription text (this would need to be adapted based on your actual STT output)
                # For now, we'll simulate it
                transcription_text = "Transcribed text would appear here"
                
                # Send to frontend via callback
                if self.transcription_callback:
                    await self.transcription_callback({
                        "type": "transcription",
                        "text": transcription_text,
                        "confidence": 0.95,
                        "timestamp": time.strftime("%H:%M:%S")
                    })
                
                return result
                
            except Exception as e:
                logger.error(f"Error in transcription callback: {e}")
                return None
        
        # Override the sentiment analysis method
        original_sentiment = self.handler.sentiment_analysis
        
        def sentiment_callback(text: str):
            """Capture sentiment analysis and send to frontend"""
            try:
                # Call original method
                result = original_sentiment([text])
                
                # Extract sentiment data
                if result and len(result) > 0:
                    sentiment_data = result[0]
                    
                    # Send to frontend via callback
                    if self.sentiment_callback:
                        asyncio.create_task(self.sentiment_callback({
                            "type": "sentiment",
                            "label": sentiment_data.get('label', 'Unknown'),
                            "score": sentiment_data.get('score', 0.5),
                            "confidence": sentiment_data.get('confidence', 0.8),
                            "timestamp": time.strftime("%H:%M:%S")
                        }))
                
                return result
                
            except Exception as e:
                logger.error(f"Error in sentiment callback: {e}")
                return None
        
        # Apply overrides
        self.handler._run_stt = transcription_callback
        self.handler.sentiment_analysis = sentiment_callback
    
    def set_transcription_callback(self, callback):
        """Set callback for transcription updates"""
        self.transcription_callback = callback
        logger.info("Transcription callback set")
    
    def set_sentiment_callback(self, callback):
        """Set callback for sentiment updates"""
        self.sentiment_callback = callback
        logger.info("Sentiment callback set")
    
    def get_status(self) -> Dict[str, Any]:
        """Get current backend status"""
        return {
            "status": "running" if self.is_running else "stopped",
            "handler_type": "GeminiHandler" if self.handler else None,
            "modality": "audio-video",
            "mode": "send-receive",
            "is_running": self.is_running,
            "has_callbacks": {
                "transcription": self.transcription_callback is not None,
                "sentiment": self.sentiment_callback is not None
            }
        }
    
    async def process_audio_chunk(self, audio_data: bytes, sample_rate: int = 24000) -> Dict[str, Any]:
        """Process audio chunk from frontend"""
        try:
            if not self.handler or not self.is_running:
                return {"status": "error", "message": "Backend not running"}
            
            # Convert audio data to numpy array (this is a simplified example)
            import numpy as np
            audio_array = np.frombuffer(audio_data, dtype=np.float32)
            
            # Process through handler (this would need to be adapted to your actual audio processing)
            # For now, we'll simulate processing
            logger.info(f"Processing audio chunk: {len(audio_array)} samples at {sample_rate}Hz")
            
            return {
                "status": "success",
                "processed": True,
                "samples": len(audio_array),
                "sample_rate": sample_rate
            }
            
        except Exception as e:
            logger.error(f"Error processing audio chunk: {e}")
            return {"status": "error", "error": str(e)}
    
    async def update_settings(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Update backend settings"""
        try:
            if not self.handler:
                return {"status": "error", "message": "Backend not running"}
            
            # Update VAD configuration
            if 'vad_threshold' in settings:
                self.handler.vad_cfg.started_talking_threshold = float(settings['vad_threshold'])
                logger.info(f"VAD threshold updated to: {settings['vad_threshold']}")
            
            # Update audio settings
            if 'sample_rate' in settings:
                # This would need to be handled in your audio setup
                logger.info(f"Sample rate setting updated to: {settings['sample_rate']}")
            
            return {
                "status": "success",
                "message": "Settings updated",
                "updated_settings": settings
            }
            
        except Exception as e:
            logger.error(f"Error updating settings: {e}")
            return {"status": "error", "error": str(e)}

# Example usage and testing
async def test_integration():
    """Test the backend integration"""
    integration = BackendIntegration()
    
    # Test starting backend
    result = await integration.start_backend()
    print(f"Start result: {result}")
    
    # Test getting status
    status = integration.get_status()
    print(f"Status: {status}")
    
    # Test stopping backend
    result = await integration.stop_backend()
    print(f"Stop result: {result}")

if __name__ == "__main__":
    # Run test if executed directly
    asyncio.run(test_integration())
