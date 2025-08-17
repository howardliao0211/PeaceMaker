import React, { useState, useEffect, useRef } from 'react';

function App() {
  // Basic state for functionality
  const [isRecording, setIsRecording] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [gradioLoaded, setGradioLoaded] = useState(false);
  const [gradioError, setGradioError] = useState(null);

  // New state for sentiment analysis and transcript
  const [sentimentResults, setSentimentResults] = useState([]);
  const [transcripts, setTranscripts] = useState([]);
  const [websocketConnected, setWebsocketConnected] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  
  // WebSocket reference
  const websocketRef = useRef(null);

  useEffect(() => {
    // Check backend connection periodically
    const checkBackend = async () => {
      if (!gradioLoaded) {
        const isRunning = await testBackendConnection();
        if (isRunning && !gradioLoaded) {
          console.log('🔄 Backend detected, waiting for iframe to load...');
        }
      }
    };
    
    const backendCheckInterval = setInterval(checkBackend, 5000);
    
    return () => {
      if (backendCheckInterval) {
        clearInterval(backendCheckInterval);
      }
    };
  }, [gradioLoaded]);

  // WebSocket connection for real-time sentiment analysis
  useEffect(() => {
    if (gradioLoaded && !websocketConnected && !websocketRef.current) {
      connectWebSocket();
    }

    return () => {
      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }
    };
  }, [gradioLoaded]); // Removed websocketConnected from dependencies

  // Auto-reconnect if connection is lost
  useEffect(() => {
    if (gradioLoaded && !websocketConnected && !websocketRef.current) {
      const reconnectTimer = setTimeout(() => {
        console.log('🔄 Attempting to reconnect WebSocket...');
        connectWebSocket();
      }, 2000); // Wait 2 seconds before reconnecting

      return () => clearTimeout(reconnectTimer);
    }
  }, [gradioLoaded, websocketConnected]);

  // Listen for messages from Gradio iframe
  useEffect(() => {
    const handleMessage = (event) => {
      // Only accept messages from our own origin or from localhost
      if (event.origin !== window.location.origin && 
          !event.origin.includes('localhost') && 
          !event.origin.includes('127.0.0.1')) {
        return;
      }
      
      try {
        const data = event.data;
        console.log('📨 Message from Gradio iframe:', data);
        
        if (data.type === 'transcription') {
          // Handle transcription from Gradio
          setTranscripts(prev => [...prev, {
            text: data.text,
            confidence: data.confidence || 0.8,
            id: Date.now(),
            timestamp: new Date().toLocaleTimeString()
          }]);
        } else if (data.type === 'sentiment') {
          // Handle sentiment from Gradio
          setSentimentResults(prev => [...prev, {
            label: data.label,
            score: data.score || 0.5,
            confidence: data.confidence || 0.8,
            id: Date.now(),
            timestamp: new Date().toLocaleTimeString()
          }]);
        } else if (data.type === 'recording_status') {
          // Handle recording status from Gradio
          if (data.status === 'started') {
            setIsRecording(true);
          } else if (data.status === 'stopped') {
            setIsRecording(false);
          }
        }
      } catch (error) {
        console.error('Error handling message from Gradio:', error);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const connectWebSocket = () => {
    // Prevent multiple connections
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      console.log('🔌 WebSocket already connected, skipping...');
      return;
    }
    
    try {
      const sessionId = `session_${Date.now()}`;
      setCurrentSessionId(sessionId);
      
      console.log('🔌 Attempting WebSocket connection...');
      const ws = new WebSocket(`ws://localhost:8000/ws/${sessionId}`);
      websocketRef.current = ws;

      ws.onopen = () => {
        console.log('🔌 WebSocket connected successfully');
        setWebsocketConnected(true);
        
        // Send initial status request
        ws.send(JSON.stringify({
          type: 'get_status'
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        setWebsocketConnected(false);
        websocketRef.current = null;
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setWebsocketConnected(false);
        websocketRef.current = null;
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  };

  const handleWebSocketMessage = (message) => {
    switch (message.type) {
      case 'sentiment':
        // Handle sentiment analysis results from backend
        const sentimentData = message.data;
        setSentimentResults(prev => [...prev, {
          ...sentimentData,
          id: Date.now(),
          timestamp: new Date().toLocaleTimeString()
        }]);
        console.log('📊 Sentiment analysis received:', sentimentData);
        break;
        
      case 'transcription':
        // Handle transcription data from backend
        const transcriptData = message.data;
        setTranscripts(prev => [...prev, {
          ...transcriptData,
          id: Date.now(),
          timestamp: new Date().toLocaleTimeString()
        }]);
        console.log('📝 Transcription received:', transcriptData);
        break;
        
      case 'connection':
        console.log('🔌 WebSocket connection established:', message.session_id);
        break;
        
      case 'status':
        console.log('📊 Status received:', message);
        break;
        
      default:
        console.log('📨 WebSocket message received:', message);
    }
  };

  const sendWebSocketMessage = (type, data = {}) => {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify({
        type,
        data,
        session_id: currentSessionId
      }));
    }
  };

  const testBackendConnection = async () => {
    try {
      const wsResponse = await fetch('http://localhost:8000/api/health');
      const gradioResponse = await fetch('http://localhost:7860');
      
      if (wsResponse.ok && gradioResponse.ok) {
        console.log('✅ Backend server and Gradio interface are running');
        return true;
      } else {
        console.log('❌ Backend server responded with error');
        return false;
      }
    } catch (error) {
      console.log('❌ Backend server is not accessible');
      return false;
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const startRecording = async () => {
    if (!gradioLoaded) {
      alert('Please wait for the AI interface to load before starting recording');
      return;
    }
    
    console.log('🎙️ Starting recording...');
    
    try {
      // Send WebSocket message to start recording
      sendWebSocketMessage('control', { command: 'start_recording' });
      
      // Also try to communicate with Gradio iframe
      const gradioFrame = document.querySelector('iframe[src="/gradio-embed.html"]');
      if (gradioFrame && gradioFrame.contentWindow) {
        try {
          // Try to post message to Gradio iframe
          gradioFrame.contentWindow.postMessage({
            type: 'start_recording',
            timestamp: Date.now()
          }, '*');
        } catch (error) {
          console.log('Could not communicate with Gradio iframe:', error);
        }
      }
      
      setIsRecording(true);
      console.log('✅ Recording started successfully');
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Failed to start recording. Please check the console for details.');
    }
  };

  const stopRecording = async () => {
    console.log('🛑 Stopping recording...');
    
    try {
      // Send WebSocket message to stop recording
      sendWebSocketMessage('control', { command: 'stop_recording' });
      
      // Also try to communicate with Gradio iframe
      const gradioFrame = document.querySelector('iframe[src="/gradio-embed.html"]');
      if (gradioFrame && gradioFrame.contentWindow) {
        try {
          // Try to post message to Gradio iframe
          gradioFrame.contentWindow.postMessage({
            type: 'stop_recording',
            timestamp: Date.now()
          }, '*');
        } catch (error) {
          console.log('Could not communicate with Gradio iframe:', error);
        }
      }
      
      setIsRecording(false);
      console.log('✅ Recording stopped successfully');
    } catch (error) {
      console.error('Failed to stop recording:', error);
      alert('Failed to stop recording. Please check the console for details.');
    }
  };

  const toggleVideo = async () => {
    try {
      if (isVideoOn) {
        setIsVideoOn(false);
        console.log('📹 Video disabled');
      } else {
        try {
          await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: 'user'
            },
            audio: false
          });
          
          setIsVideoOn(true);
          console.log('📹 Video enabled');
        } catch (error) {
          alert('Failed to access camera');
        }
      }
    } catch (error) {
      console.error('Video control error:', error);
    }
  };

  const testConnection = () => {
    console.log('Testing backend connection...');
    testBackendConnection();
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <i className="fas fa-peace"></i>
            <span>PeaceMaker</span>
          </div>
          <div className="header-controls">
            <div className={`status-indicator ${gradioLoaded ? 'connected' : 'disconnected'}`}>
              <div className="status-dot"></div>
              {gradioLoaded ? 'AI Ready' : 'AI Loading...'}
            </div>
            <button className="btn btn-secondary" onClick={testConnection}>
              <i className="fas fa-server"></i>
            </button>
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
          {/* AI Interface Header */}
          <div className="ai-interface-header">
            <h2>🤖 PeaceMaker AI Interface</h2>
            <p>Use the interface below for real-time transcription, sentiment analysis, and AI-powered conversation</p>
            <div className="backend-status">
              <span className={`status-dot ${gradioLoaded ? 'online' : 'offline'}`}></span>
              <span>Backend Server: {gradioLoaded ? 'Running' : 'Starting...'}</span>
              {!gradioLoaded && (
                <small>Make sure to run <code>python main.py</code> in your terminal</small>
              )}
              {gradioLoaded && (
                <small>Connected to Gradio interface on port 7860</small>
              )}
              <div style={{marginTop: '10px', fontSize: '12px', color: '#666'}}>
                <strong>Note:</strong> If camera/microphone isn't working, restart your backend with the updated configuration
              </div>
            </div>
          </div>
          
          {/* Gradio Interface Container */}
          <div className="gradio-container">
            {!gradioLoaded && !gradioError && (
              <div className="gradio-loading">
                <div className="loading-spinner"></div>
                <p>Loading AI Interface...</p>
              </div>
            )}
            
            {gradioError && (
              <div className="gradio-error">
                <div className="error-icon">⚠️</div>
                <h3>Failed to Load AI Interface</h3>
                <p>{gradioError}</p>
                <button 
                  className="btn btn-primary" 
                  onClick={() => {
                    setGradioError(null);
                    setGradioLoaded(false);
                  }}
                >
                  Retry
                </button>
              </div>
            )}
            
            <iframe
              src="/gradio-embed.html"
              title="PeaceMaker AI Interface"
              width="100%"
              height="600"
              style={{
                border: 'none',
                borderRadius: '8px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                display: gradioLoaded ? 'block' : 'none'
              }}
              allow="camera; microphone; geolocation; encrypted-media"
              allowFullScreen
              onLoad={() => {
                setGradioLoaded(true);
                console.log('✅ AI Interface loaded successfully');
              }}
              onError={() => setGradioError('Failed to load AI interface. Make sure the backend server is running on localhost:7860.')}
            />
          </div>
          
          {/* Video Controls Overlay */}
          <div className="video-controls">
            {!gradioLoaded && (
              <div className="controls-notice">
                <i className="fas fa-info-circle"></i>
                <span>AI Interface loading... Please wait</span>
              </div>
            )}
            
            <div className="controls-buttons">
              <button 
                className={`control-btn ${isRecording ? 'recording' : ''}`}
                onClick={toggleRecording}
                disabled={!gradioLoaded}
                title={!gradioLoaded ? 'Wait for AI interface to load' : 'Start/Stop recording'}
              >
                <i className={`fas ${isRecording ? 'fa-stop' : 'fa-microphone'}`}></i>
              </button>
              <button 
                className={`control-btn ${isVideoOn ? 'active' : ''}`}
                onClick={toggleVideo}
                disabled={!gradioLoaded}
                title={!gradioLoaded ? 'Wait for AI interface to load' : 'Toggle video'}
              >
                <i className={`fas ${isVideoOn ? 'fa-video' : 'fa-video-slash'}`}></i>
              </button>
              <button 
                className="control-btn" 
                onClick={() => console.log('Screen share clicked')}
                disabled={!gradioLoaded}
                title={!gradioLoaded ? 'Wait for AI interface to load' : 'Screen share'}
              >
                <i className="fas fa-desktop"></i>
              </button>
              <button 
                className="control-btn" 
                onClick={() => {
                  setGradioLoaded(false);
                  setGradioError(null);
                }}
                title="Refresh AI Interface"
              >
                <i className="fas fa-sync-alt"></i>
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
              <span className={`status-dot ${gradioLoaded ? 'online' : 'offline'}`}></span>
              <span>AI Interface: {gradioLoaded ? 'Online' : 'Offline'}</span>
            </div>
            <div className="status-indicator">
              <span className={`status-dot ${websocketConnected ? 'online' : 'offline'}`}></span>
              <span>WebSocket: {websocketConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
            <div className="status-indicator">
              <span className={`status-dot ${isRecording ? 'online' : 'offline'}`}></span>
              <span>Recording: {isRecording ? 'Active' : 'Inactive'}</span>
            </div>
            {currentSessionId && (
              <div className="session-info">
                <small>Session: {currentSessionId}</small>
              </div>
            )}
          </div>

          {/* Sentiment Analysis */}
          <div className="sentiment-card">
            <h3>Sentiment Analysis</h3>
            <div className="sentiment-display">
              {websocketConnected ? (
                <div className="sentiment-results">
                  {sentimentResults.length > 0 ? (
                    sentimentResults.map((result, index) => (
                      <div key={result.id} className={`sentiment-item ${result.label.toLowerCase()}`}>
                        <div className="sentiment-label">
                          <span className={`label-badge ${result.label.toLowerCase()}`}>
                            {result.label}
                          </span>
                          <span className="confidence">
                            {(result.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="sentiment-score">
                          Score: {result.score.toFixed(3)}
                        </div>
                        <div className="sentiment-timestamp">
                          {result.timestamp}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="sentiment-placeholder">
                      <i className="fas fa-chart-line"></i>
                      <p>Waiting for sentiment analysis results...</p>
                      <small>Start recording to see real-time sentiment analysis</small>
                    </div>
                  )}
                </div>
              ) : (
                <div className="sentiment-placeholder">
                  <i className="fas fa-wifi"></i>
                  <p>Connecting to sentiment analysis service...</p>
                  <small>WebSocket connection required</small>
                </div>
              )}
            </div>
          </div>

          {/* Transcript Display */}
          <div className="transcript-card">
            <h3>Live Transcript</h3>
            <div className="transcript-display">
              {websocketConnected ? (
                <div className="transcript-results">
                  {transcripts.length > 0 ? (
                    transcripts.map((transcript, index) => (
                      <div key={transcript.id} className="transcript-item">
                        <div className="transcript-text">
                          {transcript.text}
                        </div>
                        <div className="transcript-meta">
                          <span className="confidence">
                            Confidence: {(transcript.confidence * 100).toFixed(1)}%
                          </span>
                          <span className="timestamp">
                            {transcript.timestamp}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="transcript-placeholder">
                      <i className="fas fa-microphone"></i>
                      <p>Waiting for transcript...</p>
                      <small>Start recording to see live transcription</small>
                    </div>
                  )}
                </div>
              ) : (
                <div className="transcript-placeholder">
                  <i className="fas fa-wifi"></i>
                  <p>Connecting to transcription service...</p>
                  <small>WebSocket connection required</small>
                </div>
              )}
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
            <span className={`status-indicator ${gradioLoaded ? 'online' : 'offline'}`}>
              AI: {gradioLoaded ? 'Ready' : 'Loading...'}
            </span>
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
