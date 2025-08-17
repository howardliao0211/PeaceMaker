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
        original_stt = self.handler.stt
        
        async def capture_stt(audio_data):
            try:
                # Call original STT
                result = await original_stt(audio_data)
                
                # Capture transcription if available
                if hasattr(result, 'text') and result.text:
                    if self.transcription_callback:
                        await self.transcription_callback({
                            "text": result.text,
                            "confidence": getattr(result, 'confidence', 0.8),
                            "timestamp": time.time()
                        })
                
                return result
            except Exception as e:
                logger.error(f"Error in STT capture: {e}")
                return await original_stt(audio_data)
        
        # Replace the STT method
        self.handler.stt = capture_stt
    
    def set_transcription_callback(self, callback):
        """Set callback for transcription data"""
        self.transcription_callback = callback
    
    def set_sentiment_callback(self, callback):
        """Set callback for sentiment data"""
        self.sentiment_callback = callback
    
    async def process_audio(self, audio_data: bytes) -> Dict[str, Any]:
        """Process audio data through the backend"""
        try:
            if not self.is_running or not self.handler:
                return {
                    "status": "error",
                    "error": "Backend not running"
                }
            
            # Convert audio data to numpy array (simplified)
            import numpy as np
            audio_array = np.frombuffer(audio_data, dtype=np.float32)
            
            # Process through STT
            transcription = await self.handler.stt((24000, audio_array))
            
            # Process sentiment if transcription available
            sentiment = None
            if hasattr(transcription, 'text') and transcription.text:
                sentiment = await self._analyze_sentiment(transcription.text)
            
            return {
                "status": "success",
                "transcription": transcription,
                "sentiment": sentiment,
                "timestamp": time.time()
            }
            
        except Exception as e:
            logger.error(f"Error processing audio: {e}")
            return {
                "status": "error",
                "error": str(e)
            }
    
    async def _analyze_sentiment(self, text: str) -> Dict[str, Any]:
        """Analyze sentiment of transcribed text"""
        try:
            if hasattr(self.handler, 'sentiment_analysis'):
                result = self.handler.sentiment_analysis(text)
                return {
                    "label": result[0]['label'],
                    "score": result[0]['score'],
                    "confidence": result[0]['score'],
                    "text": text
                }
            else:
                return {
                    "label": "neutral",
                    "score": 0.5,
                    "confidence": 0.5,
                    "text": text
                }
        except Exception as e:
            logger.error(f"Error in sentiment analysis: {e}")
            return {
                "label": "error",
                "score": 0.0,
                "confidence": 0.0,
                "text": text
            }

# Test function
async def test_integration():
    """Test the backend integration"""
    logger.info("Testing backend integration...")
    
    integration = BackendIntegration()
    
    # Test starting backend
    result = await integration.start_backend()
    logger.info(f"Start result: {result}")
    
    if result["status"] == "success":
        # Test stopping backend
        stop_result = await integration.stop_backend()
        logger.info(f"Stop result: {stop_result}")
    
    logger.info("Integration test completed")

if __name__ == "__main__":
    asyncio.run(test_integration())
