# Sarva
### *One classroom, every language*

> An AI-driven real-time multilingual captioning system that removes language barriers and makes classroom education inclusive for all students. Now supercharged with AI Smart Notes, Cloudflare Tunnels, and persistent Session Management!

---

## What is Sarva?

Sarva is a real-time captioning system built for Indian classrooms. When a teacher speaks, Sarva instantly transcribes the speech and delivers live captions to every student's phone in their preferred language — Hindi, Tamil, Kannada, Telugu, or Malayalam — simultaneously. No app installation is required. Students simply scan a QR code.

The latest version transforms Sarva from just a live captioning tool into a **complete teaching dashboard**. It automatically records and stores your session transcripts, allowing you to generate AI-powered Smart Notes, create manual notes, and export beautiful PDFs of your lectures.

---

## 🚀 New Features in V3

- 🧠 **AI Smart Notes** — Generate beautifully formatted Markdown study guides directly from your raw lecture transcripts using Google's Gemini 3.8-Flash model. Download them instantly as beautiful PDFs.
- 🗄️ **Persistent Database & Sessions** — All your lectures, recordings, and transcripts are now automatically saved in a local SQLite database (`sarva.db`). Never lose a lecture again.
- 🌍 **Global Student Access** — We've integrated Cloudflare Tunnels (`untun`). Students can join from *anywhere* in the world via a secure HTTPS link, without needing to be on the same WiFi network!
- 📓 **Manual Notes & Merging** — Save standalone notes, or seamlessly merge new recordings into existing session notes. 
- 🎛️ **Full Teacher Dashboard** — A completely redesigned Glassmorphism dashboard replacing the old teacher UI. Manage your current session, view past notes, and access settings from a clean, unified interface.

## Core Features

- 🎙️ **Real-Time Speech Transcription** — Continuous 2-second audio chunks powered by Sarvam AI (Saaras V3)
- 🌐 **6-Language Simultaneous Translation** — English, Hindi, Tamil, Kannada, Telugu, and Malayalam
- 🎵 **Live Microphone Waveform Visualizer** — Canvas-based real-time soundwave visualizer using Web Audio API
- 👥 **Active Student Connection Counter** — Real-time live student count tracking via Socket.io
- 🔇 **RMS Silence & Hallucination Filtering** — Built-in energy thresholding to eliminate false transcriptions during quiet periods
- 📱 **Floating QR Code Joining** — Non-intrusive floating QR panel; students scan to connect instantly
- 🔠 **Student Font Size Controls** — `A−` / `A+` controls on mobile for comfortable caption reading

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
     ↓ ──[ Saves to SQLite DB & Filters noise ]
Parallel Translation across 6 languages (Google Translate API)
     ↓
WebSocket Broadcast via Socket.io
     ├──► Teacher Display: Displays live caption, detected language, soundwave
     └──► Student Phones: Displays caption in each student's chosen language
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, Vanilla CSS (Glassmorphism), JavaScript (ES6+), html2pdf.js, marked.js, QRCode.js |
| Backend | Node.js, Express.js, Socket.io, Multer, untun (Cloudflare tunnels) |
| Database | SQLite3 (`better-sqlite3`) |
| Transcription Service | Python 3, Flask, Wave, Struct, Sarvam AI API (`saaras:v3`) |
| AI Summaries | Google Gemini API (`gemini-3.8-flash`) |
| Translation | Google Translate API |
| Audio Processing | ffmpeg |

---

## Prerequisites

- Node.js (v20+) and npm
- Python 3.10+
- ffmpeg
- Sarvam AI API Key (Free tier available at [sarvam.ai](https://www.sarvam.ai))
- Gemini API Key (Available via Google AI Studio)

---

## Installation

**1. Clone the repository**
```bash
git clone https://github.com/abtimist/sarva.git
cd sarva
```

**2. Install Node.js dependencies**
```bash
cd server
npm install
cd ..
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

Create a `.env` file in the root of the project:
```env
SARVAM_API_KEY=your_sarvam_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
TRANSCRIBE_PORT=5001
SILENCE_RMS_THRESHOLD=500
```

---

## Running Sarva

Open two terminal windows from the root directory:

**Terminal 1 — Start the Python Transcription Service**
```bash
source .venv/bin/activate
python server/transcribe.py
```
*Output:*
```
Sarvam STT service ready on port 5001 (silence threshold RMS=500)
```

**Terminal 2 — Start the Node.js Web Server**
```bash
cd server
npm start
```
*Output:*
```
Server: http://localhost:3000
Student (Local): http://192.168.x.x:3000/student
Starting cloudflared tunnel to http://localhost:3000
Student (Global): https://<random-words>.trycloudflare.com/student
```

---

## Usage

### Teacher Dashboard
1. Open `http://localhost:3000` on the classroom main screen or laptop connected to a projector.
2. The new **Dashboard** provides access to the live classroom, notes, and settings.
3. Click **Start Recording** to begin a session. 
4. The QR code provided will automatically point to the Global Cloudflare URL, meaning students can scan it and connect instantly without needing to be on the same WiFi network!
5. Stop the recording when done. Navigate to the **Notes** page to manage transcripts.

### AI Notes & Export
1. On the **Notes** page, you'll see a history of all your lectures grouped by date.
2. Click **📥 Raw Transcript** to download exactly what was spoken.
3. Click **✨ Download AI Summarized Notes** to send the raw transcripts to Gemini and download a beautifully formatted study guide PDF instantly.
4. You can also manually add notes to your dashboard!

### Students
1. Scan the floating QR code displayed on the teacher's dashboard.
2. Select your language preference (English, हिन्दी, தமிழ், ಕನ್ನಡ, తెలుగు, മലയാളം).
3. The captions will stream live in your chosen language!
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
