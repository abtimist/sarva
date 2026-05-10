# Sarva
### *One classroom, every language*

> An AI-driven real-time multilingual captioning system that removes language barriers and makes classroom education inclusive for all students.

---

## What is Sarva?

Sarva is a real-time captioning system built for Indian classrooms. When a teacher speaks, Sarva instantly transcribes the speech and delivers live captions to every student's phone in their preferred language — Hindi, Tamil, Kannada, Telugu, or Malayalam — simultaneously. No app installation required. Students simply scan a QR code.

---

## Features

- 🎙️ **Real-time speech transcription** — Continuous 2-second audio chunks with automatic language detection
- 🌐 **6-language simultaneous translation** — English, Hindi, Tamil, Kannada, Telugu, Malayalam
- 📱 **QR code student joining** — Students scan and connect instantly via mobile browser
- 🗣️ **Per-student language selection** — Each student independently chooses their preferred language
- 🖥️ **Large classroom display** — Teacher-facing screen with captions in large font for the whole class
- 🔇 **Noise suppression** — Built-in echo cancellation and noise suppression for real classrooms
- ⚡ **Low latency delivery** — WebSocket-based broadcasting under 1 second delivery to all devices
- 🔒 **Recording gate** — Server only processes audio when recording is actively started

---

## How It Works

```
Teacher speaks
     ↓
Audio captured in 2-second chunks (MediaRecorder API)
     ↓
Sent to Python transcription service (Sarvam AI Saaras V3)
     ↓
Transcription sent to Node.js server
     ↓
Translated to all 6 languages in parallel (Google Translate API)
     ↓
Broadcast via WebSocket to all connected devices simultaneously
     ↓
Teacher screen → shows caption in teacher's preferred language
Student phones → each shows caption in student's chosen language
```

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Teacher Device                     │
│   Browser → MediaRecorder → POST /audio-chunk       │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Node.js Server (index.js)              │
│   Express + Socket.io + Multer + Axios              │
│                       │                             │
│         POST /transcribe                            │
│                       │                             │
│   ┌───────────────────▼──────────────────────┐      │
│   │     Python Flask Server (transcribe.py)  │      │
│   │     Sarvam AI Saaras V3 API              │      │
│   └───────────────────┬──────────────────────┘      │
│                       │ transcript text             │
│         Google Translate API (6 languages)          │
│                       │                             │
│         WebSocket broadcast → all clients           │
└──────────┬────────────────────────┬─────────────────┘
           │                        │
┌──────────▼───────┐    ┌───────────▼──────────────────┐
│  Teacher Display │    │     Student Phones (N)       │
│  teacher.html    │    │     student.html             │
│  Large captions  │    │     Language picker          │
│  + QR code       │    │     Scan QR → instant join   │
└──────────────────┘    └──────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, JavaScript, MediaRecorder API, QRCode.js |
| Backend | Node.js, Express.js, Socket.io, Multer, Axios |
| Transcription Service | Python, Flask |
| Speech-to-Text | Sarvam AI API (Saaras V3) |
| Translation | Google Translate API |
| Real-time Communication | WebSocket (Socket.io) |
| Audio Processing | ffmpeg |

**Languages:** HTML (66.4%) · JavaScript (19.6%) · Python (14.0%)

---

## Prerequisites

- Node.js and npm
- Python 3 and pip
- ffmpeg
- Sarvam AI API key (free tier at [sarvam.ai](https://www.sarvam.ai))

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
```

**3. Install Python dependencies**
```bash
pip install flask requests --break-system-packages
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

**5. Add your Sarvam AI API key**

Open `server/transcribe.py` and replace:
```python
SARVAM_API_KEY = "your-sarvam-api-key-here"
```

Get your free API key at [sarvam.ai](https://www.sarvam.ai)

---

## Running Sarva

Open two terminals:

**Terminal 1 — Start the transcription service**
```bash
cd sarva
python server/transcribe.py
```

You should see:
```
Sarvam STT service ready on port 5001
```

**Terminal 2 — Start the Node server**
```bash
cd sarva/server
node index.js
```

You should see:
```
Server running at http://localhost:3000
Student URL (for QR): http://192.168.x.x:3000/student
```

---

## Usage

### Teacher
1. Open `http://localhost:3000` on the classroom display device
2. Cast or project the screen so the whole class can see it
3. Select your preferred display language from the dropdown
4. Click **Start Recording** and begin teaching
5. Captions appear live on screen in large font
6. QR code is displayed alongside captions for students to scan

### Students
1. Connect to the same WiFi network as the teacher device
2. Scan the QR code displayed on the classroom screen
3. Select your preferred language: English / हिन्दी / தமிழ் / ಕನ್ನಡ / తెలుగు / മലയാളം
4. Live captions appear on your phone in your chosen language

---

## Supported Languages

| Language | Code |
|---|---|
| English | en |
| Hindi | hi |
| Tamil | ta |
| Kannada | kn |
| Telugu | te |
| Malayalam | ml |

---

## Project Structure

```
sarva/
├── server/
│   ├── index.js          # Node.js server — WebSocket, translation, routing
│   └── transcribe.py     # Python Flask — Sarvam AI transcription service
├── public/
│   ├── teacher.html      # Teacher classroom display with QR code
│   └── student.html      # Student mobile caption viewer
└── README.md
```

---

## Academic Context

Sarva was developed as a research project titled:

> **"Development and Performance Analysis of an AI-Driven Real-Time Captioning System for Inclusive Education"**

The system addresses two core challenges in Indian classroom education:
1. **Language barriers** — students learning in a language different from their mother tongue
2. **Inclusive access** — ensuring every student, regardless of language background, has equal access to classroom content

---

## License

MIT License — free to use, modify, and distribute.

---

<div align="center">
  <strong>Sarva</strong> — One classroom, every language
</div>
