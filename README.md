# Sarva
### *One classroom, every language*

> An AI-driven real-time multilingual captioning system that removes language barriers and makes classroom education inclusive for all students.

---

## What is Sarva?

Sarva is a real-time captioning system built for Indian classrooms. When a teacher speaks, Sarva instantly transcribes the speech and delivers live captions to every student's phone in their preferred language — Hindi, Tamil, Kannada, Telugu, or Malayalam — simultaneously. No app installation required. Students simply scan a QR code.

---

## Features

- 🎙️ **Real-Time Speech Transcription** — Continuous 2-second audio chunks powered by Sarvam AI (Saaras V3)
- 🌐 **6-Language Simultaneous Translation** — English, Hindi, Tamil, Kannada, Telugu, and Malayalam
- 🎵 **Live Microphone Waveform Visualizer** — Canvas-based real-time soundwave visualizer using Web Audio API
- 👥 **Active Student Connection Counter** — Real-time live student count tracking via Socket.io
- ⏱️ **Latency & Performance Monitor** — End-to-end processing time measured and color-coded in real-time
- 🔇 **RMS Silence & Hallucination Filtering** — Built-in energy thresholding (RMS filter) and length filtering to eliminate false transcriptions during quiet periods
- 🏷️ **Automatic Language Detection Badge** — Detects and displays the teacher's spoken language on screen
- ⏳ **Session Timer** — Real-time session duration tracker on the top status bar
- 📱 **Floating QR Code Joining** — Non-intrusive floating QR panel; students scan to connect instantly
- 🔠 **Student Font Size Controls** — `A−` / `A+` controls on mobile for comfortable caption reading
- 🎨 **Modern Glassmorphism Design System** — Built with Google Fonts (Outfit), smooth gradients, and dark mode aesthetics

---

## How It Works

```
Teacher speaks
     ↓
Audio captured in 2-second chunks (MediaRecorder API)
     ↓
Python STT Service (transcribe.py)
     ↓ ──[ RMS Energy < Threshold? ]──► Discard silence (No API call)
     ↓ (If speech energy detected)
Sarvam AI (Saaras V3 API) Speech-to-Text & Language Detection
     ↓
Node.js Orchestrator (index.js)
     ↓ ──[ Length < 4 chars? ]──► Filter out background noise
Parallel Translation across 6 languages (Google Translate API) + Latency Timing
     ↓
WebSocket Broadcast via Socket.io
     ├──► Teacher Display: Displays live caption, detected language, soundwave, and latency
     └──► Student Phones: Displays caption in each student's chosen language & custom text size
```

---

## System Architecture

```
┌────────────────────────────────────────────────────────┐
│                     Teacher Device                     │
│  Browser → MediaRecorder → Web Audio Waveform Canvas   │
│                 POST /audio-chunk                      │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│               Node.js Server (index.js)                │
│    Express + Socket.io + Multer + Latency Tracker     │
│                           │                            │
│           POST /transcribe                             │
│                           │                            │
│    ┌──────────────────────▼───────────────────────┐    │
│    │    Python Flask Server (transcribe.py)       │    │
│    │    - RMS Silence Filter (wave + struct)      │    │
│    │    - Sarvam AI Saaras V3 STT API             │    │
│    └──────────────────────┬───────────────────────┘    │
│                           │ transcript & language      │
│            Google Translate API (6 languages)          │
│                           │                            │
│            WebSocket broadcast → all clients           │
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
┌──────────────▼──────┐   ┌───────────────▼──────────────┐
│   Teacher Display   │   │     Student Mobile Devices   │
│   teacher.html      │   │     student.html             │
│   - Large Captions  │   │     - Language Selector      │
│   - Waveform Canvas │   │     - Font Size Controls     │
│   - Student Counter │   │     - Floating QR Join       │
│   - Latency Badge   │   │                              │
└─────────────────────┘   └──────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, Vanilla CSS (Glassmorphism), JavaScript (ES6+), Canvas API, Web Audio API, QRCode.js, Google Fonts (Outfit) |
| Backend | Node.js, Express.js, Socket.io, Multer, Axios |
| Transcription Service | Python 3, Flask, Wave, Struct |
| Speech-to-Text | Sarvam AI API (`saaras:v3`) |
| Translation | Google Translate API |
| Real-time Communication | WebSockets (Socket.io) |
| Audio Processing | ffmpeg |

---

## Prerequisites

- Node.js (v18+) and npm
- Python 3.10+
- ffmpeg
- Sarvam AI API Key (Free tier available at [sarvam.ai](https://www.sarvam.ai))

---

## Installation

**1. Clone the repository**
```bash
git clone https://github.com/abtimist/sarva.git
cd sarva
```

**2. Install Node.js dependencies**
```bash
npm install
```

**3. Set up Python Virtual Environment & Install dependencies**
```bash
python -m venv .venv
source .venv/bin/activate
pip install flask requests
```

**4. Install ffmpeg**
```bash
# Arch/Manjaro Linux
sudo pacman -S ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# macOS
brew install ffmpeg
```

**5. Environment Configuration**

Create a `.env` file in the root of the project (or copy from `.env.example`):
```bash
cp .env.example .env
```

Set up your variables inside `.env`:
```env
SARVAM_API_KEY=your_sarvam_api_key_here
PORT=3000
TRANSCRIBE_PORT=5001
SILENCE_RMS_THRESHOLD=500
```

---

## Running Sarva

Open two terminal windows:

**Terminal 1 — Start the Python Transcription Service**
```bash
.venv/bin/python server/transcribe.py
```
*Output:*
```
Sarvam STT service ready on port 5001 (silence threshold RMS=500)
```

**Terminal 2 — Start the Node.js Web Server**
```bash
node server/index.js
```
*Output:*
```
Server running at http://localhost:3000
Student URL (for QR): http://192.168.x.x:3000/student
```

---

## Usage

### Teacher
1. Open `http://localhost:3000` on the classroom main screen or laptop connected to a projector.
2. Select your preferred display language pill.
3. Click **🎤 Start Recording** and begin speaking.
4. Real-time captions, spoken language detection, live audio waveform, student count, and processing latency appear automatically.

### Students
1. Connect to the classroom WiFi network.
2. Scan the floating QR code displayed in the top-right corner of the teacher display.
3. Select your language preference (English, हिन्दी, தமிழ், ಕನ್ನಡ, తెలుగు, മലയാളം).
4. Use `A−` / `A+` buttons to adjust caption text size to your preference.

---

## Supported Languages

| Language | Code | Native Name |
|---|---|---|
| English | en | English |
| Hindi | hi | हिन्दी |
| Tamil | ta | தமிழ் |
| Kannada | kn | ಕನ್ನಡ |
| Telugu | te | తెలుగు |
| Malayalam | ml | മലയാളം |

---

## Project Structure

```
sarva/
├── .env.example        # Environment variables template
├── .gitignore          # Git ignore rules (node_modules, .env, .venv, etc.)
├── package.json        # Node.js project configuration & scripts
├── README.md           # Project documentation
├── public/
│   ├── student.html    # Student mobile caption viewer with language & font controls
│   └── teacher.html    # Teacher display with waveform, stats bar, & floating QR
└── server/
    ├── index.js        # Node.js orchestrator (Express, Socket.io, Translation)
    └── transcribe.py   # Python STT microservice (Sarvam AI API & RMS Silence Filter)
```

---

## Academic Context

Sarva was developed as a research project titled:

> **"Development and Performance Analysis of an AI-Driven Real-Time Captioning System for Inclusive Education"**

The system addresses two core challenges in Indian classroom education:
1. **Language barriers** — students learning in a language different from their native language.
2. **Inclusive access** — ensuring every student, regardless of language background, has equal access to classroom content in real-time.

---

## License

MIT License — free to use, modify, and distribute.

---

<div align="center">
  <strong>Sarva</strong> — One classroom, every language
</div>
