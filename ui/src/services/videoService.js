class VideoService {
  constructor() {
    this.videoElement = null;
    this.canvas = null;
    this.ctx = null;
    this.stream = null;
    this.isStreaming = false;
    this.frameInterval = null;
    this.frameRate = 30;
    this.quality = 0.8;
    this.width = 640;
    this.height = 480;
    this.onVideoFrame = null;
    this.onVideoError = null;
  }

  // Initialize video service
  async initialize(videoElement, options = {}) {
    try {
      this.videoElement = videoElement;
      
      // Set options
      if (options.frameRate) this.frameRate = options.frameRate;
      if (options.quality) this.quality = options.quality;
      if (options.width) this.width = options.width;
      if (options.height) this.height = options.height;

      // Create canvas for frame capture
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.ctx = this.canvas.getContext('2d');

      console.log('✅ Video service initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing video service:', error);
      throw error;
    }
  }

  // Start video stream
  async startVideo(options = {}) {
    if (this.isStreaming) {
      console.warn('⚠️ Video already streaming');
      return false;
    }

    try {
      // Request camera access
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: this.width },
          height: { ideal: this.height },
          frameRate: { ideal: this.frameRate },
          facingMode: 'user'
        },
        audio: false
      });

      // Set video element source
      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        this.videoElement.play();
      }

      this.isStreaming = true;

      // Start frame capture
      this.startFrameCapture();

      console.log('📹 Video streaming started');
      return true;
    } catch (error) {
      console.error('❌ Error starting video stream:', error);
      if (this.onVideoError) {
        this.onVideoError(error);
      }
      throw error;
    }
  }

  // Stop video stream
  stopVideo() {
    if (!this.isStreaming) {
      console.warn('⚠️ Video not streaming');
      return false;
    }

    try {
      this.isStreaming = false;

      // Stop frame capture
      if (this.frameInterval) {
        clearInterval(this.frameInterval);
        this.frameInterval = null;
      }

      // Stop all tracks
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }

      // Clear video element
      if (this.videoElement) {
        this.videoElement.srcObject = null;
      }

      console.log('🛑 Video streaming stopped');
      return true;
    } catch (error) {
      console.error('❌ Error stopping video stream:', error);
      throw error;
    }
  }

  // Start frame capture
  startFrameCapture() {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
    }

    const interval = 1000 / this.frameRate;
    
    this.frameInterval = setInterval(() => {
      if (this.isStreaming && this.videoElement && this.canvas) {
        this.captureFrame();
      }
    }, interval);
  }

  // Capture current video frame
  captureFrame() {
    try {
      if (!this.videoElement || !this.canvas || !this.ctx) {
        return;
      }

      // Draw current video frame to canvas
      this.ctx.drawImage(
        this.videoElement,
        0, 0,
        this.videoElement.videoWidth,
        this.videoElement.videoHeight,
        0, 0,
        this.canvas.width,
        this.canvas.height
      );

      // Convert canvas to blob
      this.canvas.toBlob((blob) => {
        if (blob && this.onVideoFrame) {
          this.onVideoFrame(blob, {
            width: this.canvas.width,
            height: this.canvas.height,
            timestamp: new Date().toISOString(),
            frameRate: this.frameRate,
            quality: this.quality
          });
        }
      }, 'image/jpeg', this.quality);

    } catch (error) {
      console.error('❌ Error capturing video frame:', error);
    }
  }

  // Take a single snapshot
  async takeSnapshot() {
    try {
      if (!this.videoElement || !this.canvas || !this.ctx) {
        throw new Error('Video service not initialized');
      }

      // Draw current frame
      this.ctx.drawImage(
        this.videoElement,
        0, 0,
        this.videoElement.videoWidth,
        this.videoElement.videoHeight,
        0, 0,
        this.canvas.width,
        this.canvas.height
      );

      // Convert to blob
      return new Promise((resolve, reject) => {
        this.canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create snapshot'));
          }
        }, 'image/jpeg', this.quality);
      });

    } catch (error) {
      console.error('❌ Error taking snapshot:', error);
      throw error;
    }
  }

  // Update video settings
  updateSettings(settings) {
    if (settings.frameRate) {
      this.frameRate = settings.frameRate;
      if (this.isStreaming) {
        this.startFrameCapture(); // Restart with new frame rate
      }
    }
    if (settings.quality) {
      this.quality = Math.max(0.1, Math.min(1.0, settings.quality));
    }
    if (settings.width) {
      this.width = settings.width;
      if (this.canvas) {
        this.canvas.width = this.width;
      }
    }
    if (settings.height) {
      this.height = settings.height;
      if (this.canvas) {
        this.canvas.height = this.height;
      }
    }

    console.log('⚙️ Video settings updated:', settings);
  }

  // Get current video settings
  getSettings() {
    return {
      frameRate: this.frameRate,
      quality: this.quality,
      width: this.width,
      height: this.height,
      isStreaming: this.isStreaming
    };
  }

  // Set callback for video frames
  setVideoFrameCallback(callback) {
    this.onVideoFrame = callback;
  }

  // Set callback for video errors
  setVideoErrorCallback(callback) {
    this.onVideoError = callback;
  }

  // Get streaming status
  getStreamingStatus() {
    return {
      isStreaming: this.isStreaming,
      hasStream: !!this.stream,
      hasVideoElement: !!this.videoElement,
      frameRate: this.frameRate,
      quality: this.quality,
      dimensions: `${this.width}x${this.height}`
    };
  }

  // Get available video devices
  async getVideoDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'videoinput');
    } catch (error) {
      console.error('❌ Error getting video devices:', error);
      return [];
    }
  }

  // Switch to different video device
  async switchVideoDevice(deviceId) {
    try {
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: this.width },
          height: { ideal: this.height },
          frameRate: { ideal: this.frameRate }
        },
        audio: false
      });

      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        this.videoElement.play();
      }

      console.log('🔄 Switched to video device:', deviceId);
      return true;
    } catch (error) {
      console.error('❌ Error switching video device:', error);
      throw error;
    }
  }

  // Clean up resources
  cleanup() {
    try {
      this.stopVideo();
      
      if (this.canvas) {
        this.canvas.remove();
        this.canvas = null;
        this.ctx = null;
      }
      
      this.videoElement = null;
      
      console.log('🧹 Video service cleaned up');
    } catch (error) {
      console.error('❌ Error cleaning up video service:', error);
    }
  }
}

// Create singleton instance
const videoService = new VideoService();

export default videoService;
