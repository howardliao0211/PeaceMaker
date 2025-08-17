class AudioService {
  constructor() {
    this.mediaRecorder = null;
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.isRecording = false;
    this.audioChunks = [];
    this.stream = null;
    this.onAudioData = null;
    this.onTranscription = null;
    this.recordingInterval = null;
    this.sampleRate = 24000;
    this.channels = 1;
    this.vadThreshold = 0.2;
    this.echoCancellation = true;
    this.noiseSuppression = true;
  }

  // Initialize audio context and get user permission
  async initialize() {
    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.sampleRate,
          channelCount: this.channels,
          echoCancellation: this.echoCancellation,
          noiseSuppression: this.noiseSuppression,
          autoGainControl: true
        },
        video: false
      });

      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.sampleRate
      });

      // Create analyser for voice activity detection
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;

      // Connect microphone to analyser
      this.microphone = this.audioContext.createMediaStreamSource(this.stream);
      this.microphone.connect(this.analyser);

      console.log('✅ Audio service initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing audio service:', error);
      throw error;
    }
  }

  // Start recording audio
  async startRecording() {
    if (this.isRecording) {
      console.warn('⚠️ Already recording');
      return false;
    }

    if (!this.stream) {
      await this.initialize();
    }

    try {
      this.isRecording = true;
      this.audioChunks = [];

      // Create media recorder
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      });

      // Handle recorded data
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          this.processAudioChunk(event.data);
        }
      };

      // Start recording
      this.mediaRecorder.start(100); // Collect data every 100ms

      // Start real-time audio analysis
      this.startAudioAnalysis();

      console.log('🎙️ Audio recording started');
      return true;
    } catch (error) {
      console.error('❌ Error starting audio recording:', error);
      this.isRecording = false;
      throw error;
    }
  }

  // Stop recording audio
  stopRecording() {
    if (!this.isRecording) {
      console.warn('⚠️ Not recording');
      return false;
    }

    try {
      this.isRecording = false;

      if (this.mediaRecorder) {
        this.mediaRecorder.stop();
        this.mediaRecorder = null;
      }

      if (this.recordingInterval) {
        clearInterval(this.recordingInterval);
        this.recordingInterval = null;
      }

      console.log('🛑 Audio recording stopped');
      return true;
    } catch (error) {
      console.error('❌ Error stopping audio recording:', error);
      throw error;
    }
  }

  // Process audio chunk in real-time
  async processAudioChunk(audioBlob) {
    try {
      // Convert blob to array buffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      // Convert to audio buffer
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      // Extract audio data
      const audioData = audioBuffer.getChannelData(0);
      
      // Check voice activity
      if (this.detectVoiceActivity(audioData)) {
        // Send audio data to WebSocket if callback is set
        if (this.onAudioData) {
          this.onAudioData(audioData, {
            sample_rate: this.sampleRate,
            channels: this.channels,
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error('❌ Error processing audio chunk:', error);
    }
  }

  // Start real-time audio analysis
  startAudioAnalysis() {
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
    }

    this.recordingInterval = setInterval(() => {
      if (this.isRecording && this.analyser) {
        this.analyzeAudio();
      }
    }, 50); // Analyze every 50ms
  }

  // Analyze current audio for voice activity
  analyzeAudio() {
    try {
      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      this.analyser.getByteFrequencyData(dataArray);

      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const averageVolume = sum / bufferLength;

      // Check if volume exceeds threshold (voice activity detection)
      if (averageVolume > this.vadThreshold * 255) {
        // Voice detected - could trigger transcription or other actions
        if (this.onTranscription) {
          this.onTranscription({
            volume: averageVolume / 255,
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error('❌ Error analyzing audio:', error);
    }
  }

  // Detect voice activity in audio data
  detectVoiceActivity(audioData) {
    try {
      // Calculate RMS (Root Mean Square) for volume detection
      let sum = 0;
      for (let i = 0; i < audioData.length; i++) {
        sum += audioData[i] * audioData[i];
      }
      const rms = Math.sqrt(sum / audioData.length);
      
      // Return true if volume exceeds threshold
      return rms > this.vadThreshold;
    } catch (error) {
      console.error('❌ Error detecting voice activity:', error);
      return false;
    }
  }

  // Update audio settings
  updateSettings(settings) {
    if (settings.sample_rate) {
      this.sampleRate = settings.sample_rate;
    }
    if (settings.vad_threshold !== undefined) {
      this.vadThreshold = settings.vad_threshold;
    }
    if (settings.echo_cancellation !== undefined) {
      this.echoCancellation = settings.echo_cancellation;
    }
    if (settings.noise_suppression !== undefined) {
      this.noiseSuppression = settings.noiseSuppression;
    }

    console.log('⚙️ Audio settings updated:', settings);
  }

  // Get current audio settings
  getSettings() {
    return {
      sample_rate: this.sampleRate,
      channels: this.channels,
      vad_threshold: this.vadThreshold,
      echo_cancellation: this.echoCancellation,
      noise_suppression: this.noiseSuppression
    };
  }

  // Set callback for audio data
  setAudioDataCallback(callback) {
    this.onAudioData = callback;
  }

  // Set callback for transcription events
  setTranscriptionCallback(callback) {
    this.onTranscription = callback;
  }

  // Get recording status
  getRecordingStatus() {
    return {
      isRecording: this.isRecording,
      hasStream: !!this.stream,
      hasAudioContext: !!this.audioContext,
      sampleRate: this.sampleRate,
      channels: this.channels
    };
  }

  // Clean up resources
  cleanup() {
    try {
      this.stopRecording();
      
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }
      
      if (this.audioContext) {
        this.audioContext.close();
        this.audioContext = null;
      }
      
      this.microphone = null;
      this.analyser = null;
      this.audioChunks = [];
      
      console.log('🧹 Audio service cleaned up');
    } catch (error) {
      console.error('❌ Error cleaning up audio service:', error);
    }
  }

  // Get available audio devices
  async getAudioDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'audioinput');
    } catch (error) {
      console.error('❌ Error getting audio devices:', error);
      return [];
    }
  }

  // Switch to different audio device
  async switchAudioDevice(deviceId) {
    try {
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          sampleRate: this.sampleRate,
          channelCount: this.channels,
          echoCancellation: this.echoCancellation,
          noiseSuppression: this.noiseSuppression,
          autoGainControl: true
        }
      });

      if (this.audioContext && this.microphone) {
        this.microphone.disconnect();
        this.microphone = this.audioContext.createMediaStreamSource(this.stream);
        this.microphone.connect(this.analyser);
      }

      console.log('🔄 Switched to audio device:', deviceId);
      return true;
    } catch (error) {
      console.error('❌ Error switching audio device:', error);
      throw error;
    }
  }
}

// Create singleton instance
const audioService = new AudioService();

export default audioService;
