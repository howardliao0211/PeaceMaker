class WebSocketService {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.messageHandlers = new Map();
    this.connectionHandlers = new Map();
    this.isConnecting = false;
    this.autoReconnect = true;
  }

  // Initialize WebSocket connection
  connect(sessionId = null) {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.isConnecting = true;
    this.sessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const wsUrl = `ws://localhost:8000/ws/${this.sessionId}`;
    
    try {
      this.ws = new WebSocket(wsUrl);
      this.setupEventHandlers();
      console.log(`🔗 Connecting to WebSocket: ${wsUrl}`);
    } catch (error) {
      console.error('❌ WebSocket connection error:', error);
      this.isConnecting = false;
      this.handleConnectionError(error);
    }
  }

  // Setup WebSocket event handlers
  setupEventHandlers() {
    this.ws.onopen = () => {
      console.log('✅ WebSocket connected successfully');
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.notifyConnectionHandlers('connected');
      
      // Send initial connection message
      this.send({
        type: 'connection',
        data: {
          session_id: this.sessionId,
          client_type: 'web_ui',
          timestamp: new Date().toISOString()
        }
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('❌ Error parsing WebSocket message:', error);
      }
    };

    this.ws.onclose = (event) => {
      console.log('🔌 WebSocket disconnected:', event.code, event.reason);
      this.isConnecting = false;
      this.notifyConnectionHandlers('disconnected');
      
      if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      this.handleConnectionError(error);
    };
  }

  // Handle incoming messages
  handleMessage(message) {
    console.log('📨 Received message:', message);
    
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      try {
        handler(message.data);
      } catch (error) {
        console.error(`❌ Error in message handler for ${message.type}:`, error);
      }
    } else {
      console.log(`⚠️ No handler found for message type: ${message.type}`);
    }
  }

  // Send message to WebSocket
  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const messageWithTimestamp = {
          ...message,
          timestamp: new Date().toISOString(),
          session_id: this.sessionId
        };
        
        this.ws.send(JSON.stringify(messageWithTimestamp));
        console.log('📤 Sent message:', messageWithTimestamp);
        return true;
      } catch (error) {
        console.error('❌ Error sending message:', error);
        return false;
      }
    } else {
      console.warn('⚠️ WebSocket not connected, cannot send message');
      return false;
    }
  }

  // Send audio data
  sendAudio(audioData, metadata = {}) {
    return this.send({
      type: 'audio_data',
      data: {
        audio: audioData,
        metadata: {
          sample_rate: metadata.sample_rate || 24000,
          channels: metadata.channels || 1,
          timestamp: new Date().toISOString(),
          ...metadata
        }
      }
    });
  }

  // Send video frame
  sendVideoFrame(videoFrame, metadata = {}) {
    return this.send({
      type: 'video_frame',
      data: {
        frame: videoFrame,
        metadata: {
          width: metadata.width || 640,
          height: metadata.height || 480,
          timestamp: new Date().toISOString(),
          ...metadata
        }
      }
    });
  }

  // Send transcription
  sendTranscription(text, confidence = 1.0, metadata = {}) {
    return this.send({
      type: 'transcription',
      data: {
        text,
        confidence,
        timestamp: new Date().toISOString(),
        ...metadata
      }
    });
  }

  // Send audio settings
  sendAudioSettings(settings) {
    return this.send({
      type: 'audio_settings',
      data: settings
    });
  }

  // Send control commands
  sendControl(command, data = {}) {
    return this.send({
      type: 'control',
      data: {
        command,
        timestamp: new Date().toISOString(),
        ...data
      }
    });
  }

  // Test connection with ping
  ping() {
    return this.send({ type: 'ping' });
  }

  // Request status update
  requestStatus() {
    return this.send({ type: 'get_status' });
  }

  // Start recording session
  startRecording(settings = {}) {
    return this.sendControl('start_recording', settings);
  }

  // Stop recording session
  stopRecording() {
    return this.sendControl('stop_recording');
  }

  // Start AI session
  startAISession(settings = {}) {
    return this.sendControl('start_ai_session', settings);
  }

  // Stop AI session
  stopAISession() {
    return this.sendControl('stop_ai_session');
  }

  // Register message handler
  onMessage(type, handler) {
    this.messageHandlers.set(type, handler);
  }

  // Register connection handler
  onConnection(type, handler) {
    if (!this.connectionHandlers.has(type)) {
      this.connectionHandlers.set(type, []);
    }
    this.connectionHandlers.get(type).push(handler);
  }

  // Remove message handler
  removeMessageHandler(type) {
    this.messageHandlers.delete(type);
  }

  // Remove connection handler
  removeConnectionHandler(type, handler) {
    const handlers = this.connectionHandlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  // Notify connection handlers
  notifyConnectionHandlers(status) {
    const handlers = this.connectionHandlers.get(status);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(this.sessionId);
        } catch (error) {
          console.error('❌ Error in connection handler:', error);
        }
      });
    }
  }

  // Schedule reconnection
  scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`🔄 Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    setTimeout(() => {
      if (this.autoReconnect && this.ws?.readyState !== WebSocket.OPEN) {
        this.connect(this.sessionId);
      }
    }, delay);
  }

  // Handle connection errors
  handleConnectionError(error) {
    console.error('❌ WebSocket connection error:', error);
    this.notifyConnectionHandlers('error');
  }

  // Disconnect WebSocket
  disconnect() {
    this.autoReconnect = false;
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
    
    this.isConnecting = false;
    this.notifyConnectionHandlers('disconnected');
  }

  // Get connection status
  getConnectionStatus() {
    if (!this.ws) return 'disconnected';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
        return 'closing';
      case WebSocket.CLOSED:
        return 'disconnected';
      default:
        return 'unknown';
    }
  }

  // Check if connected
  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // Get session ID
  getSessionId() {
    return this.sessionId;
  }

  // Update auto-reconnect setting
  setAutoReconnect(enabled) {
    this.autoReconnect = enabled;
  }
}

// Create singleton instance
const websocketService = new WebSocketService();

export default websocketService;

