import React, { useRef, useEffect, useState } from 'react';

const VideoInterface = ({ isVideoOn, onVideoToggle, isRecording }) => {
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isVideoOn && !stream) {
      startVideo();
    } else if (!isVideoOn && stream) {
      stopVideo();
    }
  }, [isVideoOn]);

  const startVideo = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setStream(mediaStream);
      }
    } catch (err) {
      console.error('Error accessing video:', err);
      setError('Failed to access video camera');
    }
  };

  const stopVideo = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const captureFrame = () => {
    if (videoRef.current && stream) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      
      context.drawImage(videoRef.current, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.8);
    }
    return null;
  };

  return (
    <div className="video-interface">
      <div className="video-container">
        {isVideoOn ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="video-element"
            style={{
              width: '100%',
              height: 'auto',
              borderRadius: '8px',
              border: isRecording ? '3px solid #ff4444' : '1px solid #ddd'
            }}
          />
        ) : (
          <div className="video-placeholder">
            <div className="placeholder-icon">📹</div>
            <p>Video is off</p>
            <small>Click "Video On" to start camera</small>
          </div>
        )}
      </div>
      
      {error && (
        <div className="video-error">
          <span>❌ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}
      
      <div className="video-controls">
        <button
          className={`video-toggle-btn ${isVideoOn ? 'active' : ''}`}
          onClick={onVideoToggle}
        >
          {isVideoOn ? '📹 Video On' : '📹 Video Off'}
        </button>
        
        {isVideoOn && (
          <button
            className="capture-btn"
            onClick={captureFrame}
            title="Capture current frame"
          >
            📸 Capture
          </button>
        )}
      </div>
    </div>
  );
};

export default VideoInterface;
