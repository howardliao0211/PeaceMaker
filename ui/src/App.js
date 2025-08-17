import React, { useState, useEffect, useRef } from 'react';
import NotificationSystem from './components/NotificationSystem';
import { handleError, ErrorTypes } from './utils/errorHandler';
import websocketService from './services/websocketService';
import audioService from './services/audioService';
import videoService from './services/videoService';

function App() {
  // Basic state for functionality
  const [isRecording, setIsRecording] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [transcriptions, setTranscriptions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Recording interval reference
  const recordingIntervalRef = useRef(null);
  
  // Video element reference
  const videoRef = useRef(null);

  // Notification system - only show errors, no success notifications
  const addNotification = (message, type = 'error', duration = 8000) => {
    // Only show error notifications, skip success/info
    if (type !== 'error') {
      return;
    }
    
    const id = Date.now();
    const notification = {
      id,
      message,
      type,
      timestamp: new Date()
    };
    
    setNotifications(prev => [...prev, notification]);
    
    // Auto-remove error notification after duration
    setTimeout(() => {
      removeNotification(id);
    }, duration);
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n !== id));
  };

  useEffect(() => {
    // Initialize WebSocket service
    initializeWebSocket();
    
    // Initialize video service with a video element
    const videoElement = document.createElement('video');
    videoElement.style.display = 'none';
    document.body.appendChild(videoElement);
    videoService.initialize(videoElement);
    
    // Cleanup
    return () => {
      websocketService.disconnect();
      audioService.cleanup();
      videoService.cleanup();
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (videoElement && videoElement.parentNode) {
        videoElement.parentNode.removeChild(videoElement);
      }
    };
  }, []);

  // Error handling wrapper
  const handleAppError = (error, context = 'Operation') => {
    const errorInfo = handleError(error, context, ErrorTypes.GENERAL);
    addNotification(errorInfo.userMessage, 'error', 8000);
  };

  const initializeWebSocket = () => {
    try {
      // Set up WebSocket message handlers
      websocketService.onMessage('transcription', (data) => {
        addTranscription(data);
      });
      
      websocketService.onMessage('sentiment', (data) => {
        console.log('Sentiment data received:', data);
      });
      
      websocketService.onMessage('control_response', (data) => {
        console.log('Control response received:', data);
        if (data.status === 'success') {
          console.log(`✅ ${data.message}`);
        } else {
          addNotification(`❌ ${data.message}`, 'error');
        }
      });
      
      websocketService.onMessage('settings_updated', (data) => {
        console.log('Settings updated:', data);
        console.log('⚙️ Settings updated successfully');
      });
      
      // Set up connection handlers
      websocketService.onConnection('connected', (sessionId) => {
        console.log('✅ WebSocket connected:', sessionId);
        setIsConnected(true);
        console.log('🔗 Connected to backend server');
      });
      
      websocketService.onConnection('disconnected', (sessionId) => {
        console.log('🔌 WebSocket disconnected:', sessionId);
        setIsConnected(false);
        console.log('🔌 Disconnected from backend server');
      });
      
      websocketService.onConnection('error', (sessionId) => {
        console.error('❌ WebSocket error:', sessionId);
        setIsConnected(false);
        handleAppError(new Error('WebSocket connection error'), 'WebSocket connection');
      });
      
      // Connect to WebSocket
      websocketService.connect();
      
    } catch (error) {
      handleAppError(error, 'WebSocket initialization');
    }
  };

  const addTranscription = (transcription) => {
    try {
      const newTranscription = {
        id: Date.now(),
        text: transcription.text,
        confidence: transcription.confidence,
        timestamp: new Date().toLocaleTimeString(),
        type: 'user'
      };
      
      setTranscriptions(prev => [...prev, newTranscription]);
      console.log('📝 New transcription added:', newTranscription);
    } catch (error) {
      handleAppError(error, 'Transcription processing');
    }
  };

  const toggleRecording = () => {
    try {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    } catch (error) {
      handleError(error, 'Recording control');
    }
  };

  const startRecording = async () => {
    try {
      console.log('🎙️ Starting recording...');
      setIsLoading(true);
      
      // Start audio recording using the audio service
      const success = await audioService.startRecording();
      
      if (success) {
        setIsRecording(true);
        console.log('🎙️ Recording started successfully');
        
        // Send control command to backend
        websocketService.startRecording();
        
        console.log('✅ Recording started successfully');
      } else {
        throw new Error('Failed to start recording');
      }
    } catch (error) {
      handleAppError(error, 'Recording start');
      setIsRecording(false);
    } finally {
      setIsLoading(false);
    }
  };

  const stopRecording = async () => {
    try {
      console.log('🛑 Stopping recording...');
      setIsLoading(true);
      
      // Stop audio recording using the audio service
      const success = await audioService.stopRecording();
      
      if (success) {
        setIsRecording(false);
        console.log('🛑 Recording stopped');
        
        // Send control command to backend
        websocketService.stopRecording();
        
        console.log('✅ Recording stopped successfully');
      } else {
        throw new Error('Failed to stop recording');
      }
    } catch (error) {
      handleAppError(error, 'Recording stop');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleVideo = async () => {
    try {
      if (isVideoOn) {
        // Stop video
        const success = await videoService.stopVideo();
        if (success) {
          setIsVideoOn(false);
          console.log('📹 Video disabled');
        }
      } else {
        // Start video
        const success = await videoService.startVideo();
        if (success) {
          setIsVideoOn(true);
          console.log('📹 Video enabled');
          
          // Set up video frame callback to send to WebSocket
          videoService.setVideoFrameCallback((videoFrame, metadata) => {
            websocketService.sendVideoFrame(videoFrame, metadata);
          });
        }
      }
    } catch (error) {
      handleAppError(error, 'Video control');
    }
  };

  const startAISession = async () => {
    try {
      setIsLoading(true);
      console.log('🚀 Starting AI backend session...');
      
      // Send control command via WebSocket
      const success = websocketService.startAISession();
      
      if (success) {
        console.log('🧠 AI session started successfully');
        console.log('✅ AI session started via WebSocket');
      } else {
        throw new Error('Failed to send AI session start command');
      }
    } catch (error) {
      handleAppError(error, 'AI session start');
    } finally {
      setIsLoading(false);
    }
  };

  const stopAISession = async () => {
    try {
      setIsLoading(true);
      console.log('🛑 Stopping AI backend session...');
      
      // Send control command via WebSocket
      const success = websocketService.stopAISession();
      
      if (success) {
        console.log('🛑 AI session stopped');
        console.log('✅ AI session stopped via WebSocket');
      } else {
        throw new Error('Failed to send AI session stop command');
      }
    } catch (error) {
      handleAppError(error, 'AI session stop');
    } finally {
      setIsLoading(false);
    }
  };

  const testConnection = () => {
    try {
      console.log('Testing connection...');
      if (websocketService.isConnected()) {
        websocketService.ping();
        console.log('📡 Connection test sent');
        console.log('📡 Ping sent to test connection');
      } else {
        console.log('🔌 Not connected, attempting to reconnect...');
        console.log('❌ WebSocket not connected, attempting to reconnect...');
        websocketService.connect();
      }
    } catch (error) {
      handleAppError(error, 'Connection test');
    }
  };

  const clearTranscriptions = () => {
    try {
      setTranscriptions([]);
      console.log('🗑️ All transcriptions cleared');
      console.log('🗑️ Transcriptions cleared');
    } catch (error) {
      handleError(error, 'Transcription clearing');
    }
  };

  return (
    <div className="app-container">
      {/* Notification System - Only for errors */}
      <NotificationSystem 
        notifications={notifications} 
        removeNotification={removeNotification} 
      />

      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <i className="fas fa-peace"></i>
            <span>PeaceMaker</span>
          </div>
          <div className="header-controls">
            <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
              <div className="status-dot"></div>
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
            <button className="btn btn-secondary" onClick={() => console.log('Settings clicked')}>
              <i className="fas fa-cog"></i>
            </button>
            <button className="btn btn-secondary" onClick={() => console.log('Help clicked')}>
              <i className="fas fa-question-circle"></i>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <div className="video-section">
          {/* Video Container */}
          <div className="video-container">
            <video 
              ref={videoRef}
              id="localVideo" 
              autoPlay 
              muted 
              playsInline
              style={{
                border: isRecording ? '3px solid #ff4444' : '1px solid #ddd'
              }}
            />
            
            {/* Video Controls Overlay */}
            <div className="video-controls">
              <button 
                className={`control-btn ${isRecording ? 'recording' : ''}`}
                onClick={toggleRecording}
                disabled={isLoading}
              >
                <i className={`fas ${isRecording ? 'fa-stop' : 'fa-microphone'}`}></i>
              </button>
              <button 
                className={`control-btn ${isVideoOn ? 'active' : ''}`}
                onClick={toggleVideo}
                disabled={isLoading}
              >
                <i className={`fas ${isVideoOn ? 'fa-video' : 'fa-video-slash'}`}></i>
              </button>
              <button className="control-btn" onClick={() => console.log('Screen share clicked')}>
                <i className="fas fa-desktop"></i>
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="sidebar">
          {/* Connection Status */}
          <div className="status-card">
            <h3>Connection Status</h3>
            <div className="status-indicator">
              <span className={`status-dot ${isConnected ? 'online' : 'offline'}`}></span>
              <span>{isConnected ? 'Online' : 'Offline'}</span>
            </div>
          </div>

          {/* Transcription Panel */}
          <div className="transcription-card">
            <h3>Live Transcription</h3>
            <div className="transcription-content">
              <div className="transcription-text">
                {transcriptions.length === 0 ? (
                  <p className="placeholder">Start speaking to see transcription...</p>
                ) : (
                  transcriptions.map((item, index) => (
                    <div key={index} className="transcription-item">
                      <div className="transcription-text">{item.text}</div>
                      <div className="transcription-meta">
                        <span className="timestamp">{item.timestamp}</span>
                        <span className="confidence">{item.confidence}%</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="transcription-controls">
              <button className="btn btn-small" onClick={clearTranscriptions}>
                <i className="fas fa-trash"></i> Clear
              </button>
              <button className="btn btn-small" onClick={() => console.log('Copy clicked')}>
                <i className="fas fa-copy"></i> Copy
              </button>
            </div>
          </div>

          {/* Sentiment Analysis */}
          <div className="sentiment-card">
            <h3>Sentiment Analysis</h3>
            <div className="sentiment-display">
              <div className="sentiment-placeholder">
                <i className="fas fa-chart-line"></i>
                <p>Sentiment will appear here</p>
              </div>
            </div>
          </div>

          {/* Settings Panel */}
          <div className="settings-card">
            <h3>Audio Settings</h3>
            <div className="setting-item">
              <label>Sample Rate:</label>
              <select 
                className="setting-select"
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  audioService.updateSettings({ sample_rate: value });
                  websocketService.sendAudioSettings({ sample_rate: value });
                }}
              >
                <option value="16000">16kHz</option>
                <option value="24000" defaultValue>24kHz</option>
                <option value="48000">48kHz</option>
              </select>
            </div>
            <div className="setting-item">
              <label>VAD Threshold:</label>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.1" 
                defaultValue="0.2"
                className="slider"
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  audioService.updateSettings({ vad_threshold: value });
                  websocketService.sendAudioSettings({ vad_threshold: value });
                }}
              />
              <span className="setting-value">0.2</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <div className="connection-info">
            <span>00:00:00</span>
            <span>0 KB</span>
          </div>
          <div className="footer-controls">
            <button className="btn btn-danger" onClick={() => console.log('End call clicked')}>
              <i className="fas fa-phone-slash"></i> End Call
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
