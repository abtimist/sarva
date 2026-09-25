const express = require("express");
const http = require("http");
const os = require("os");
const path = require("path");
const cors = require("cors");
const { startTunnel } = require("untun");
const { generateSmartNote } = require("./llm");
const { Server } = require("socket.io");

const db = require("./db");
const { setupSocket, getTeacherSocketId } = require("./socket");
const routes = require("./routes");

try {
  process.loadEnvFile(path.join(__dirname, "../../.env"));
} catch {}

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, "../../public")));

// ── State ──
let currentSessionId = null;
let currentRecordingId = null;
let recordingSeq = 0;
let isRecordingActive = false;

function startNewSession() {
  const result = db.prepare("INSERT INTO sessions (started_at) VALUES (datetime('now'))").run();
  currentSessionId = result.lastInsertRowid;
  return currentSessionId;
}

function endCurrentSession() {
  if (currentSessionId) {
    db.prepare("UPDATE sessions SET ended_at = datetime('now') WHERE id = ?").run(currentSessionId);
    currentSessionId = null;
  }
}

startNewSession();

// ── Expose state to routes via app.locals ──
app.locals.isRecording = () => isRecordingActive;
app.locals.getCurrentRecordingId = () => currentRecordingId;
app.locals.getCurrentSessionId = () => currentSessionId;
app.locals.getIo = () => io;

// ── Recording start/stop ──
app.post("/recording/start", (req, res) => {
  const { resumeSessionId } = req.body || {};
  isRecordingActive = true;

  if (resumeSessionId) {
    currentSessionId = resumeSessionId;
    db.prepare("UPDATE sessions SET ended_at = NULL WHERE id = ?").run(resumeSessionId);
  } else if (!currentSessionId) {
    startNewSession();
  }

  recordingSeq++;
  const recResult = db.prepare(
    "INSERT INTO recordings (session_id, sequence_number, started_at) VALUES (?, ?, datetime('now'))"
  ).run(currentSessionId, recordingSeq);
  currentRecordingId = recResult.lastInsertRowid;

  console.log(`[START] session=${currentSessionId} recording=${currentRecordingId} seq=${recordingSeq}`);

  const teacherId = getTeacherSocketId();
  if (teacherId) {
    const socket = io.sockets.sockets.get(teacherId);
    if (socket) socket.join("session:" + currentSessionId);
  }

  res.json({ ok: true, sessionId: currentSessionId, recordingId: currentRecordingId });
});

app.post("/recording/stop", (req, res) => {
  isRecordingActive = false;
  const savedRecordingId = currentRecordingId;
  const savedSessionId = currentSessionId;

  console.log(`[STOP] session=${savedSessionId} recording=${savedRecordingId}`);

  finalizeRecording(savedSessionId, savedRecordingId);
  currentRecordingId = null;
  res.json({ ok: true, sessionId: savedSessionId, recordingId: savedRecordingId });
});

function finalizeRecording(sessionId, recordingId) {
  let attempts = 0;
  const maxAttempts = 16;

  function checkAndFinalize() {
    attempts++;
    if (!recordingId || !sessionId) return;

    const pending = db.prepare(
      "SELECT COUNT(*) as cnt FROM transcripts WHERE session_id = ? AND recording_id IS NULL"
    ).get(sessionId);

    if (pending.cnt > 0 && attempts < maxAttempts) {
      setTimeout(checkAndFinalize, 500);
      return;
    }

    const transcripts = db.prepare(
      "SELECT original_text, detected_lang FROM transcripts WHERE recording_id = ? ORDER BY seq ASC"
    ).all(recordingId);

    if (transcripts.length === 0) {
      db.prepare("UPDATE recordings SET stopped_at = datetime('now') WHERE id = ?").run(recordingId);
      return;
    }

    const lines = transcripts.map((t) => t.original_text).filter((t) => t && t.trim().length > 0);
    const fullTranscript = lines.join(" ");

    const langCounts = {};
    transcripts.forEach((t) => {
      if (t.detected_lang) {
        langCounts[t.detected_lang] = (langCounts[t.detected_lang] || 0) + 1;
      }
    });
    const dominantLang = Object.entries(langCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "en-IN";

    db.prepare(
      "UPDATE recordings SET stopped_at = datetime('now'), transcript = ?, language = ? WHERE id = ?"
    ).run(fullTranscript, dominantLang, recordingId);

    const existingNotes = db.prepare(
      "SELECT id, title, content FROM notes WHERE session_id = ? ORDER BY created_at ASC"
    ).all(sessionId);

    if (existingNotes.length === 0) {
      const noteTitle = `Recording ${recordingSeq}`;
      const noteResult = db.prepare(
        "INSERT INTO notes (session_id, title, content, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))"
      ).run(sessionId, noteTitle, fullTranscript);

      const noteId = noteResult.lastInsertRowid;
      db.prepare("INSERT INTO note_recordings (note_id, recording_id) VALUES (?, ?)").run(noteId, recordingId);

      io.to("session:" + sessionId).emit("note-created", {
        noteId,
        sessionId,
        recordingId,
        title: noteTitle,
        content: fullTranscript,
        language: dominantLang,
      });
    } else {
      io.to("session:" + sessionId).emit("recording-ready", {
        sessionId,
        recordingId,
        transcript: fullTranscript,
        language: dominantLang,
        existingNotes,
      });
    }
  }

  setTimeout(checkAndFinalize, 2000);
}

// ── Routes ──
app.use(routes);

let globalUrl = null;
app.get("/server-ip", (req, res) => res.json({ ip: LOCAL_IP, port: PORT, globalUrl }));
app.get("/current-session", (req, res) => res.json({ sessionId: currentSessionId }));
app.get("/student", (req, res) => res.sendFile(path.join(__dirname, "../../public/student.html")));
app.get("/notes", (req, res) => res.sendFile(path.join(__dirname, "../../public/notes.html")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../../public/dashboard.html")));

// ── Socket.io ──
setupSocket(io, () => currentSessionId);

// ── Start ──
const PORT = process.env.PORT || 3000;
const LOCAL_IP = getLocalIP();

server.listen(PORT, "0.0.0.0", async () => {
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Student (Local): http://${LOCAL_IP}:${PORT}/student`);
  try {
    const tunnel = await startTunnel({ port: PORT });
    globalUrl = await tunnel.getURL();
    console.log(`Student (Global): ${globalUrl}/student`);
  } catch (err) {
    console.error("Untun error:", err);
  }
});

process.on("SIGINT", () => { endCurrentSession(); db.close(); process.exit(0); });
process.on("SIGTERM", () => { endCurrentSession(); db.close(); process.exit(0); });
