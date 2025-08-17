import React, { useState, useEffect } from 'react';

function App() {
  // Basic state for functionality
  const [isRecording, setIsRecording] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [gradioLoaded, setGradioLoaded] = useState(false);
  const [gradioError, setGradioError] = useState(null);

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

  const testBackendConnection = async () => {
    try {
      const wsResponse = await fetch('http://localhost:8000/health');
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
    setIsRecording(true);
    console.log('✅ Recording started successfully');
  };

  const stopRecording = async () => {
    console.log('🛑 Stopping recording...');
    setIsRecording(false);
    console.log('✅ Recording stopped successfully');
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
              <span className={`status-dot ${isRecording ? 'online' : 'offline'}`}></span>
              <span>Recording: {isRecording ? 'Active' : 'Inactive'}</span>
            </div>
          </div>

          {/* Sentiment Analysis */}
          <div className="sentiment-card">
            <h3>Sentiment Analysis</h3>
            <div className="sentiment-display">
              <div className="sentiment-placeholder">
                <i className="fas fa-chart-line"></i>
                <p>
                  {gradioLoaded 
                    ? "Sentiment analysis available in AI interface above"
                    : "Loading sentiment analysis..."
                  }
                </p>
              </div>
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
