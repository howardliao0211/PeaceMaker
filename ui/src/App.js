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
  
  // New state for mute functionality and topic suggestions
  const [isMuted, setIsMuted] = useState(false);
  const [topicSuggestions, setTopicSuggestions] = useState([]);
  
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
        
      case 'topic_suggestions':
        // Handle topic suggestions from backend
        if (message.data && Array.isArray(message.data)) {
          setTopicSuggestions(message.data);
        }
        console.log('💡 Topic suggestions received:', message.data);
        break;
        
      case 'mute_response':
        // Handle mute response from backend
        if (message.status === 'success') {
          console.log('🔇 Mute response:', message.message);
        } else {
          console.error('❌ Mute failed:', message.message);
          // Revert the mute state if it failed
          setIsMuted(false);
        }
        break;
        
      case 'unmute_response':
        // Handle unmute response from backend
        if (message.status === 'success') {
          console.log('🔊 Unmute response:', message.message);
        } else {
          console.error('❌ Unmute failed:', message.message);
          // Revert the unmute state if it failed
          setIsMuted(true);
        }
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

  const toggleMute = async () => {
    try {
      if (isMuted) {
        // Call unmute function
        sendWebSocketMessage('unmute');
        setIsMuted(false);
        console.log('🔊 Unmuted');
      } else {
        // Call mute function
        sendWebSocketMessage('mute');
        setIsMuted(true);
        console.log('🔇 Muted');
      }
    } catch (error) {
      console.error('Failed to toggle mute:', error);
    }
  };

  const getTopicSuggestions = async () => {
    try {
      sendWebSocketMessage('get_chat_suggestions');
      console.log('💡 Requesting topic suggestions...');
    } catch (error) {
      console.error('Failed to get topic suggestions:', error);
    }
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
          </div>
        </div>
      </header>

      {/* Main Content - Window-based Layout */}
      <main className="main-content">
        {/* AI Interface Window */}
        <div className="ai-window">
          <div className="window-content">
            {/* Gradio Interface Container */}
            <div className="gradio-container">
              <div className="iframe-window">
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
                  height="100%"
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
            </div>
            
            {/* Live Transcript at Bottom */}
            <div className="transcript-section">
              <div className="transcript-header">
                <h3>Live Transcript</h3>
                <button className="expand-btn" title="Expand/Collapse">
                  <i className="fas fa-chevron-down"></i>
                </button>
              </div>
              <div className="transcript-content">
                {websocketConnected ? (
                  <div className="transcript-results">
                    {transcripts.length > 0 ? (
                      <div className="transcript-list">
                        {transcripts.slice().reverse().map((transcript, index) => (
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
                        ))}
                      </div>
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
        </div>

        {/* Sidebar */}
        <div className="sidebar">
          {/* Cool Down Card */}
          <div className="cooldown-card">
            <h3>Cool Down</h3>
            <div className="cooldown-controls">
              <button 
                className={`cooldown-btn ${isMuted ? 'muted' : ''}`}
                onClick={toggleMute}
                disabled={!websocketConnected}
                title={!websocketConnected ? 'Wait for connection' : (isMuted ? 'Click to unmute' : 'Click to mute')}
              >
                <i className={`fas ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                <span>{isMuted ? 'Unmute' : 'Mute'}</span>
              </button>
              <div className="cooldown-status">
                <span className={`status-dot ${isMuted ? 'offline' : 'online'}`}></span>
                <span>Audio: {isMuted ? 'Muted' : 'Active'}</span>
              </div>
            </div>
          </div>

          {/* Topic Suggestions Card */}
          <div className="suggestions-card">
            <h3>Topic Suggestions</h3>
            <div className="suggestions-content">
              <button 
                className="refresh-suggestions-btn"
                onClick={getTopicSuggestions}
                disabled={!websocketConnected}
                title={!websocketConnected ? 'Wait for connection' : 'Get new topic suggestions'}
              >
                <i className="fas fa-lightbulb"></i>
                <span>Get Suggestions</span>
              </button>
              
              {topicSuggestions.length > 0 ? (
                <div className="suggestions-list">
                  {topicSuggestions.map((suggestion, index) => (
                    <div key={index} className="suggestion-item">
                      <i className="fas fa-comment"></i>
                      <span>{suggestion}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="suggestions-placeholder">
                  <i className="fas fa-lightbulb"></i>
                  <p>No suggestions yet</p>
                  <small>Click the button above to get topic suggestions</small>
                </div>
              )}
            </div>
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
        </div>
      </footer>
    </div>
  );
}

export default App;
