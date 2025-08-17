// Error handling utilities for PeaceMaker UI

export const ErrorTypes = {
  WEBSOCKET: 'WebSocket',
  API: 'API',
  RECORDING: 'Recording',
  VIDEO: 'Video',
  AUDIO: 'Audio',
  GENERAL: 'General'
};

export const ErrorMessages = {
  [ErrorTypes.WEBSOCKET]: {
    CONNECTION_FAILED: "🔌 Connection failed - We're still developing the real-time features!",
    MESSAGE_PARSE: "📨 Message error - We're still developing the data processing!",
    DISCONNECTED: "🔌 Disconnected - We're still developing the connection stability!"
  },
  [ErrorTypes.API]: {
    REQUEST_FAILED: "🌐 API error - We're still developing the backend integration!",
    TIMEOUT: "⏰ Request timeout - We're still developing the server performance!",
    UNAUTHORIZED: "🔐 Access denied - We're still developing the authentication!"
  },
  [ErrorTypes.RECORDING]: {
    START_FAILED: "🎙️ Recording failed - We're still developing the audio capture!",
    STOP_FAILED: "🛑 Stop failed - We're still developing the audio control!",
    PERMISSION_DENIED: "🚫 Microphone access denied - We're still developing the permissions!"
  },
  [ErrorTypes.VIDEO]: {
    START_FAILED: "📹 Video failed - We're still developing the camera integration!",
    STOP_FAILED: "🛑 Video stop failed - We're still developing the video control!",
    PERMISSION_DENIED: "🚫 Camera access denied - We're still developing the permissions!"
  },
  [ErrorTypes.AUDIO]: {
    SETTINGS_FAILED: "⚙️ Audio settings failed - We're still developing the audio processing!",
    DEVICE_NOT_FOUND: "🔍 Audio device not found - We're still developing the device detection!"
  },
  [ErrorTypes.GENERAL]: {
    UNKNOWN: "❓ Unknown error - We're still developing this feature!",
    NETWORK: "🌐 Network error - We're still developing the connection handling!",
    TIMEOUT: "⏰ Operation timeout - We're still developing the performance!"
  }
};

export const getErrorMessage = (errorType, errorCode, fallbackMessage = null) => {
  try {
    const typeMessages = ErrorMessages[errorType];
    if (typeMessages && typeMessages[errorCode]) {
      return typeMessages[errorCode];
    }
    
    // Fallback to general error message
    return fallbackMessage || ErrorMessages[ErrorTypes.GENERAL].UNKNOWN;
  } catch (error) {
    console.error('Error getting error message:', error);
    return "❓ Something went wrong - We're still developing this feature!";
  }
};

export const handleError = (error, context = 'Operation', errorType = ErrorTypes.GENERAL) => {
  // Log the actual error for developers
  console.error(`❌ ${context} error:`, error);
  
  // Determine error code based on error object
  let errorCode = 'UNKNOWN';
  
  if (error.name === 'TypeError') {
    errorCode = 'TYPE_ERROR';
  } else if (error.name === 'NetworkError') {
    errorCode = 'NETWORK';
  } else if (error.message?.includes('timeout')) {
    errorCode = 'TIMEOUT';
  } else if (error.message?.includes('permission')) {
    errorCode = 'PERMISSION_DENIED';
  } else if (error.message?.includes('connection')) {
    errorCode = 'CONNECTION_FAILED';
  }
  
  // Get user-friendly message
  const userMessage = getErrorMessage(errorType, errorCode);
  
  return {
    userMessage,
    technicalError: error,
    context,
    errorType,
    errorCode,
    timestamp: new Date()
  };
};

export const isNetworkError = (error) => {
  return error.name === 'NetworkError' || 
         error.message?.includes('network') ||
         error.message?.includes('fetch') ||
         error.message?.includes('connection');
};

export const isPermissionError = (error) => {
  return error.name === 'NotAllowedError' ||
         error.message?.includes('permission') ||
         error.message?.includes('denied');
};

export const isTimeoutError = (error) => {
  return error.name === 'TimeoutError' ||
         error.message?.includes('timeout') ||
         error.message?.includes('timed out');
};

// Error recovery suggestions
export const getRecoverySuggestion = (errorType, errorCode) => {
  const suggestions = {
    [ErrorTypes.WEBSOCKET]: {
      CONNECTION_FAILED: "Try refreshing the page or check your internet connection",
      MESSAGE_PARSE: "Try refreshing the page to reset the connection",
      DISCONNECTED: "The connection will automatically retry"
    },
    [ErrorTypes.API]: {
      REQUEST_FAILED: "Check if the backend server is running",
      TIMEOUT: "Try again in a few moments",
      UNAUTHORIZED: "Check your authentication settings"
    },
    [ErrorTypes.RECORDING]: {
      START_FAILED: "Check microphone permissions and try again",
      STOP_FAILED: "The recording should stop automatically",
      PERMISSION_DENIED: "Allow microphone access in your browser settings"
    },
    [ErrorTypes.VIDEO]: {
      START_FAILED: "Check camera permissions and try again",
      STOP_FAILED: "The video should stop automatically",
      PERMISSION_DENIED: "Allow camera access in your browser settings"
    }
  };
  
  return suggestions[errorType]?.[errorCode] || "Please try again or contact support";
};

export default {
  ErrorTypes,
  ErrorMessages,
  getErrorMessage,
  handleError,
  isNetworkError,
  isPermissionError,
  isTimeoutError,
  getRecoverySuggestion
};
