# PeaceMaker 🕊️

**Real-time Audio-Video Communication with AI Features**

PeaceMaker is a cutting-edge communication platform that combines real-time audio-video streaming with AI-powered transcription and sentiment analysis. Built with FastAPI, React, and advanced AI models, it provides an intuitive interface for real-time communication enhanced with intelligent insights.

## ✨ Features

- 🎥 **Real-time Video Streaming** - High-quality video communication
- 🎤 **Live Audio Processing** - Crystal clear audio with noise suppression
- 🧠 **AI-Powered Transcription** - Real-time speech-to-text conversion
- 😊 **Sentiment Analysis** - Live emotion detection and analysis
- 🔌 **WebSocket Integration** - Real-time bidirectional communication
- 📱 **Responsive Web UI** - Modern React interface that works on all devices
- 🌙 **Dark/Light Theme** - Customizable visual experience

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React UI      │    │   FastAPI       │    │   AI Backend    │
│   (Port 3000)   │◄──►│   (Port 8000)   │◄──►│   (Port 7860)   │
│                 │    │                 │    │                 │
│ • Video Display │    │ • WebSocket     │    │ • STT Model     │
│ • Audio Controls│    │ • REST API      │    │ • Sentiment     │
│ • Settings      │    │ • Static Files  │    │ • VAD           │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Python 3.8+**
- **Node.js 16+**
- **npm or yarn**
- **Camera and microphone access**

### 1. Clone and Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd PeaceMaker

# Install Python dependencies
pip install -r requirements.txt

# Install Node.js dependencies
cd ui
npm install
cd ..
```

### 2. Start the Services
```bash
# Terminal 1: Start the main AI backend
python main.py

# Terminal 2: Start the web server
python web_server.py

# Terminal 3: Start the React UI
cd ui
npm start
```

### 3. Access the Application

- 🌐 **Web Interface**: http://localhost:3000
- 🔌 **Backend API**: http://localhost:8000
- 🤖 **AI Interface**: http://localhost:7860

## 🎯 How to Use the Web Application

### 1. **Initial Setup**
- Open http://localhost:3000 in your browser
- Grant camera and microphone permissions when prompted
- Wait for "AI Ready" status to appear

### 2. **Core Controls**

#### 🎙️ **Recording Controls**
- **Start Recording**: Click the red "Start Recording" button
- **Stop Recording**: Click the blue "Stop Recording" button
- **Status**: Watch the recording indicator (● = Recording, ○ = Stopped)

#### 📹 **Video Controls**
- **Video On/Off**: Toggle video with the video button
- **Camera Access**: Ensure camera permissions are granted
- **Video Status**: Green = Video On, Gray = Video Off

#### 🧠 **AI Session Management**
- **Start AI Session**: Initialize AI processing
- **Stop AI Session**: Terminate AI processing
- **Connection Status**: Monitor WebSocket connection health

### 3. **Real-time Features**

#### 📝 **Live Transcription**
- Start recording and speak into your microphone
- Watch real-time transcription appear in the interface
- Each transcription entry shows timestamp and confidence

#### 😊 **Sentiment Analysis**
- Sentiment is automatically analyzed as you speak
- Results show positive/negative classification with confidence
- Real-time updates during conversation

#### 📊 **Connection Monitoring**
- WebSocket status indicator shows connection health
- Test connection button for troubleshooting
- Real-time status updates

### 4. **Settings & Customization**

#### 🎛️ **Audio Settings**
- **Sample Rate**: Adjust audio processing quality (8000Hz - 48000Hz)
- **VAD Threshold**: Voice Activity Detection sensitivity
- **Volume Control**: Master volume adjustment

#### 🔧 **Audio Processing**
- **Echo Cancellation**: Reduce audio feedback
- **Noise Suppression**: Filter background noise
- **Real-time Updates**: Settings apply immediately

#### 🎨 **Visual Settings**
- **Theme Toggle**: Switch between light and dark themes
- **Responsive Layout**: Automatically adapts to screen size

### 5. **Utility Functions**

- **Clear All**: Reset transcription history
- **Test Connection**: Verify WebSocket connectivity
- **Status Reset**: Clear all status indicators

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
HOST=0.0.0.0
PORT=8000
DEBUG=true

# AI Model Configuration
MODEL_PATH=./models
DEVICE=cpu  # or cuda for GPU acceleration

# WebSocket Configuration
WS_HEARTBEAT_INTERVAL=30
WS_MAX_CONNECTIONS=100
```

### Port Configuration

- **3000**: React Development Server
- **8000**: FastAPI Web Server
- **7860**: Gradio AI Interface
- **8001**: WebSocket Server (internal)

## 🐛 Troubleshooting

### Common Issues

#### 1. **"WebSocket connection required" Error**
```bash
# Check if services are running
lsof -i :8000  # Web server
lsof -i :7860  # AI backend
lsof -i :3000  # React UI
```

#### 2. **Recording Not Working**
- Ensure microphone permissions are granted
- Check if AI backend is fully loaded
- Verify WebSocket connection status

#### 3. **Video Not Displaying**
- Grant camera permissions in browser
- Check if camera is being used by another application
- Verify video toggle button state

#### 4. **High CPU Usage**
- Reduce sample rate in audio settings
- Disable noise suppression if not needed
- Use CPU-optimized models

### Debug Mode

Enable debug logging:

```bash
# Set environment variable
export DEBUG=true

# Or modify logger.py
logger.setLevel(logging.DEBUG)
```

## 🚀 Deployment

### Production Setup

1. **Build React App**
```bash
cd ui
npm run build
```

2. **Configure Production Server**
```bash
# Use production WSGI server
pip install gunicorn
gunicorn web_server:app -w 4 -k uvicorn.workers.UvicornWorker
```

3. **Environment Variables**
```bash
export PRODUCTION=true
export DEBUG=false
export HOST=0.0.0.0
```

### Docker Deployment

```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
RUN cd ui && npm install && npm run build

EXPOSE 8000
CMD ["python", "web_server.py"]
```

## 📁 Project Structure

```
PeaceMaker/
├── main.py              # Main AI backend with Gradio interface
├── web_server.py        # FastAPI web server with WebSocket support
├── logger.py            # Logging configuration
├── requirements.txt     # Python dependencies
├── .gitignore          # Git ignore patterns
├── README.md           # This file
├── log/                # Application logs
└── ui/                 # React frontend
    ├── src/            # React source code
    │   ├── App.js      # Main application component
    │   ├── index.js    # Application entry point
    │   └── index.css   # Global styles
    ├── public/         # Static assets
    ├── package.json    # Node.js dependencies
    └── README.md       # UI-specific documentation
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **FastAPI** for the robust web framework
- **React** for the modern UI framework
- **Transformers** for AI model integration
- **Whisper** for speech-to-text capabilities

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/discussions)
- **Documentation**: [Wiki](https://github.com/your-repo/wiki)

---

**Made with ❤️ for peaceful communication**

*PeaceMaker - Where AI meets human connection*
