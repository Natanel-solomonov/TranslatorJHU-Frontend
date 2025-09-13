# TranslatorJHU Frontend (Chrome Extension)

Real-time translation Chrome extension for video meetings with natural voice synthesis.

## 🚀 Features

- **Real-time Translation**: Live speech-to-text and translation during meetings
- **Natural Voice Synthesis**: High-quality TTS with ElevenLabs, Azure, and other providers
- **Meeting Platform Support**: Works with Zoom, Google Meet, Microsoft Teams
- **Captions Overlay**: Non-intrusive captions displayed over meeting interface
- **Voice Activity Detection**: Smart audio processing with silence detection

## 🛠 Tech Stack

- **React + TypeScript**: Modern UI development
- **Vite**: Fast build tool and dev server
- **TailwindCSS**: Utility-first styling
- **Chrome Extension Manifest V3**: Latest extension platform
- **Web Audio API**: Real-time audio capture and processing
- **WebSocket**: Real-time communication with backend

## 📦 Installation

### Development Setup

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Start development server**:

   ```bash
   npm run dev
   ```

3. **Build extension**:

   ```bash
   npm run build:extension
   ```

4. **Load in Chrome**:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist/` folder

### Production Build

```bash
npm run build:extension
```

## 🔧 Configuration

The extension automatically connects to the backend server at `ws://localhost:8080`. Make sure the backend is running before using the extension.

## 📁 Project Structure

```
src/
├── background/          # Service worker (background script)
├── content/            # Content scripts (injected into meeting pages)
├── popup/              # Extension popup UI
├── overlay/            # Captions overlay component
├── services/           # Audio capture and WebSocket services
├── store/              # Zustand state management
└── styles/             # CSS and styling

public/
├── manifest.json       # Extension manifest
└── icons/              # Extension icons
```

## 🎯 Usage

1. **Open a meeting**: Go to Zoom, Google Meet, or Microsoft Teams
2. **Click extension icon**: Open the TranslatorJHU popup
3. **Select languages**: Choose source and target languages
4. **Start translation**: Click "Start Translation"
5. **Enable captions**: Click "Show Captions" for overlay display

## 🔗 Communication with Backend

The extension communicates with the backend via WebSocket:

- **Audio streaming**: Real-time audio chunks sent to backend
- **Transcription**: Receives speech-to-text results
- **Translation**: Receives translated text and audio
- **Session management**: Start/stop translation sessions

## 🛡 Permissions

The extension requires these permissions:

- `activeTab`: Access to current meeting tab
- `tabCapture`: Audio capture from meeting tabs
- `storage`: Save user preferences
- `scripting`: Inject captions overlay

## 🔍 Development

### Available Scripts

- `npm run dev`: Development server
- `npm run build`: Production build
- `npm run lint`: ESLint checks
- `npm run type-check`: TypeScript validation

### WebSocket API

Messages sent to backend:

```typescript
// Start session
{ type: 'session:start', data: { sourceLanguage: 'en', targetLanguage: 'es' } }

// Audio data (binary)
ArrayBuffer // Raw audio data

// Stop session
{ type: 'session:stop', data: {} }
```

Messages received from backend:

```typescript
// Transcription result
{ type: 'transcription', data: { id, text, confidence, isFinal } }

// Translation result
{ type: 'translation', data: { captionId, translatedText, audioData } }
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details
