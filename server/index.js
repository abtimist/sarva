const express = require("express");
const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

try {
  process.loadEnvFile(path.join(__dirname, "../.env"));
} catch (e) {}

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

const { Server } = require("socket.io");
const multer = require("multer");
const cors = require("cors");
const axios = require("axios");
const FormData = require("form-data");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

const upload = multer({
  dest: path.join(os.tmpdir(), "audio-uploads"),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["audio/webm", "audio/ogg", "audio/wav", "audio/mpeg"];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith(".webm")) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  },
});

const LANGUAGES = { en: "English", hi: "Hindi", ta: "Tamil", kn: "Kannada", te: "Telugu", ml: "Malayalam" };

// ═══════════════════════════════════════════════
// DATABASE
// ═══════════════════════════════════════════════
const dbPath = path.join(__dirname, "sarva.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT DEFAULT 'Untitled Session',
    created_at TEXT DEFAULT (datetime('now')),
    started_at TEXT,
    ended_at TEXT
  );

  CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    sequence_number INTEGER NOT NULL,
    language TEXT,
    transcript TEXT DEFAULT '',
    started_at TEXT,
    stopped_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    recording_id INTEGER,
    seq INTEGER,
    original_text TEXT,
    detected_lang TEXT,
    en TEXT, hi TEXT, ta TEXT, kn TEXT, te TEXT, ml TEXT,
    processing_ms INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (recording_id) REFERENCES recordings(id)
  );

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    title TEXT DEFAULT 'Note',
    content TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS note_recordings (
    note_id INTEGER NOT NULL,
    recording_id INTEGER NOT NULL,
    PRIMARY KEY (note_id, recording_id),
    FOREIGN KEY (note_id) REFERENCES notes(id),
    FOREIGN KEY (recording_id) REFERENCES recordings(id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migration: add recording_id to old transcripts if missing
try {
  db.prepare("SELECT recording_id FROM transcripts LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE transcripts ADD COLUMN recording_id INTEGER");
}

// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
let currentSessionId = null;
let currentRecordingId = null;
let recordingSeq = 0;
let chunkSeq = 0;
let isRecording = false;
let activeLanguages = ["en", "hi"]; // Default active languages

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

// ═══════════════════════════════════════════════
// AUTHENTICATION API
// ═══════════════════════════════════════════════

app.post("/api/signup", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  
  try {
    const result = db.prepare("INSERT INTO users (email, password) VALUES (?, ?)").run(email, password);
    res.json({ success: true, userId: result.lastInsertRowid });
  } catch (err) {
    if (err.message.includes("UNIQUE constraint failed")) {
      res.status(400).json({ error: "Email already exists" });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  
  const user = db.prepare("SELECT * FROM users WHERE email = ? AND password = ?").get(email, password);
  if (user) {
    res.json({ success: true, userId: user.id });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

// Start initial session
startNewSession();

// ═══════════════════════════════════════════════
// TRANSLATION
// ═══════════════════════════════════════════════
async function translateText(text, targetLang) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await axios.get(url, { timeout: 8000 });
    return res.data[0].map((item) => item[0]).join("");
  } catch (e) {
    return text;
  }
}

async function translateAll(text) {
  const results = {};
  await Promise.allSettled(
    Object.keys(LANGUAGES).map(async (lang) => {
      results[lang] = await translateText(text, lang);
    })
  );
  return results;
}

// ═══════════════════════════════════════════════
// HEALTH
// ═══════════════════════════════════════════════
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    recording: isRecording,
    session: currentSessionId,
    recording: currentRecordingId,
    students: studentSockets.size,
    uptime: process.uptime(),
  });
});

// ═══════════════════════════════════════════════
// RECORDING START / STOP
// ═══════════════════════════════════════════════
app.post("/recording/start", (req, res) => {
  const { resumeSessionId } = req.body || {};
  isRecording = true;
  chunkSeq = 0;

  if (resumeSessionId) {
    currentSessionId = resumeSessionId;
    db.prepare("UPDATE sessions SET ended_at = NULL WHERE id = ?").run(resumeSessionId);
  } else if (!currentSessionId) {
    startNewSession();
  }

  // Create a new recording segment within this session
  recordingSeq++;
  const recResult = db.prepare(
    "INSERT INTO recordings (session_id, sequence_number, started_at) VALUES (?, ?, datetime('now'))"
  ).run(currentSessionId, recordingSeq);
  currentRecordingId = recResult.lastInsertRowid;

  console.log(`[START] session=${currentSessionId} recording=${currentRecordingId} seq=${recordingSeq}`);

  if (teacherSocketId) {
    const socket = io.sockets.sockets.get(teacherSocketId);
    if (socket) {
      socket.join("session:" + currentSessionId);
    }
  }

  res.json({ ok: true, sessionId: currentSessionId, recordingId: currentRecordingId });
});

app.post("/recording/stop", (req, res) => {
  isRecording = false;
  const savedRecordingId = currentRecordingId;
  const savedSessionId = currentSessionId;

  console.log(`[STOP] session=${savedSessionId} recording=${savedRecordingId}`);

  // Wait for in-flight transcripts, then finalize recording + create note
  finalizeRecording(savedSessionId, savedRecordingId);

  currentRecordingId = null;
  res.json({ ok: true, sessionId: savedSessionId, recordingId: savedRecordingId });
});

// ═══════════════════════════════════════════════
// FINALIZE RECORDING → CREATE NOTE
// ═══════════════════════════════════════════════
function finalizeRecording(sessionId, recordingId) {
  // Poll for in-flight transcripts: check every 500ms, up to 8 seconds
  let attempts = 0;
  const maxAttempts = 16;

  function checkAndFinalize() {
    attempts++;

    if (!recordingId || !sessionId) {
      console.log("[FINALIZE] No recording/session to finalize");
      return;
    }

    // Check if there are still pending uploads (transcripts without recording_id for this session)
    const pending = db.prepare(
      "SELECT COUNT(*) as cnt FROM transcripts WHERE session_id = ? AND recording_id IS NULL"
    ).get(sessionId);

    if (pending.cnt > 0 && attempts < maxAttempts) {
      console.log(`[FINALIZE] Waiting for ${pending.cnt} pending transcripts (attempt ${attempts}/${maxAttempts})`);
      setTimeout(checkAndFinalize, 500);
      return;
    }

    // Query all transcripts for this recording
    const transcripts = db.prepare(
      "SELECT original_text, detected_lang FROM transcripts WHERE recording_id = ? ORDER BY seq ASC"
    ).all(recordingId);

    console.log(`[FINALIZE] Recording ${recordingId}: ${transcripts.length} transcripts`);

    if (transcripts.length === 0) {
      console.log("[FINALIZE] No meaningful transcript — skipping note creation");
      db.prepare("UPDATE recordings SET stopped_at = datetime('now') WHERE id = ?").run(recordingId);
      return;
    }

    // Build the recording transcript (English text, concatenated)
    const lines = transcripts.map(t => t.original_text).filter(t => t && t.trim().length > 0);
    const fullTranscript = lines.join(" ");

    // Detect dominant language
    const langCounts = {};
    transcripts.forEach(t => {
      if (t.detected_lang) {
        langCounts[t.detected_lang] = (langCounts[t.detected_lang] || 0) + 1;
      }
    });
    const dominantLang = Object.entries(langCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "en-IN";

    // Update recording
    db.prepare(
      "UPDATE recordings SET stopped_at = datetime('now'), transcript = ?, language = ? WHERE id = ?"
    ).run(fullTranscript, dominantLang, recordingId);

    console.log(`[FINALIZE] Recording ${recordingId} finalized: "${fullTranscript.substring(0, 80)}..."`);

    // Check if session already has notes
    const existingNotes = db.prepare(
      "SELECT id, title, content FROM notes WHERE session_id = ? ORDER BY created_at ASC"
    ).all(sessionId);

    if (existingNotes.length === 0) {
      // First recording — auto-create a note
      const noteTitle = `Recording ${recordingSeq}`;
      const noteResult = db.prepare(
        "INSERT INTO notes (session_id, title, content, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))"
      ).run(sessionId, noteTitle, fullTranscript);

      const noteId = noteResult.lastInsertRowid;
      db.prepare("INSERT INTO note_recordings (note_id, recording_id) VALUES (?, ?)").run(noteId, recordingId);

      console.log(`[FINALIZE] Note ${noteId} created from recording ${recordingId}`);

      io.to("session:" + sessionId).emit("note-created", {
        noteId,
        sessionId,
        recordingId,
        title: noteTitle,
        content: fullTranscript,
        language: dominantLang,
      });
    } else {
      // 2nd+ recording — ask teacher to merge or create new
      console.log(`[FINALIZE] Session ${sessionId} has ${existingNotes.length} existing notes — emitting recording-ready`);
      io.to("session:" + sessionId).emit("recording-ready", {
        sessionId,
        recordingId,
        transcript: fullTranscript,
        language: dominantLang,
        existingNotes,
      });
    }
  }

  // Start checking after 2 seconds
  setTimeout(checkAndFinalize, 2000);
}

// ═══════════════════════════════════════════════
// AUDIO CHUNKS
// ═══════════════════════════════════════════════
app.post("/audio-chunk", upload.single("audio"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  if (!isRecording) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.json({ ok: true, text: "" });
  }

  const seq = ++chunkSeq;
  const startTime = Date.now();
  const recId = currentRecordingId;
  const sessId = currentSessionId;

  try {
    const form = new FormData();
    form.append("audio", fs.createReadStream(req.file.path), { filename: "audio.webm", contentType: "audio/webm" });

    const transcribePort = process.env.TRANSCRIBE_PORT || 5001;
    const transcribeRes = await axios.post(`http://localhost:${transcribePort}/transcribe`, form, { headers: form.getHeaders(), timeout: 30000 });

    const originalText = transcribeRes.data.text;
    const detectedLang = transcribeRes.data.language || null;

    if (!originalText || originalText.trim().length < 4) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.json({ ok: true, text: "" });
    }

    const translations = await translateAll(originalText);
    const payload = { seq, original: originalText, detectedLang, ...translations, processingMs: Date.now() - startTime };

    // Store transcript linked to both session and recording
    try {
      db.prepare(`
        INSERT INTO transcripts (session_id, recording_id, seq, original_text, detected_lang, en, hi, ta, kn, te, ml, processing_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(sessId, recId, seq, originalText, detectedLang, translations.en, translations.hi, translations.ta, translations.kn, translations.te, translations.ml, payload.processingMs);
    } catch (e) { console.error("DB error:", e.message); }

    io.emit("caption", payload);
    try { fs.unlinkSync(req.file.path); } catch {}
    res.json({ ok: true });
  } catch (e) {
    try { fs.unlinkSync(req.file?.path || ""); } catch {}
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════
// NOTES API
// ═══════════════════════════════════════════════

// Get all notes for a session (with their recordings)
app.get("/api/notes/:sessionId", (req, res) => {
  try {
    const notes = db.prepare(`
      SELECT n.*,
        GROUP_CONCAT(r.id) as recording_ids,
        GROUP_CONCAT(r.transcript, '|||') as recording_transcripts,
        GROUP_CONCAT(r.language) as recording_languages,
        GROUP_CONCAT(r.sequence_number) as recording_seqs
      FROM notes n
      LEFT JOIN note_recordings nr ON nr.note_id = n.id
      LEFT JOIN recordings r ON r.id = nr.recording_id
      WHERE n.session_id = ?
      GROUP BY n.id
      ORDER BY n.created_at ASC
    `).all(req.params.sessionId);

    // Parse the grouped fields
    const parsed = notes.map(n => {
      const recordings = [];
      if (n.recording_ids) {
        const ids = n.recording_ids.split(",");
        const transcripts = (n.recording_transcripts || "").split("|||");
        const langs = (n.recording_languages || "").split(",");
        const seqs = (n.recording_seqs || "").split(",");
        for (let i = 0; i < ids.length; i++) {
          recordings.push({
            id: parseInt(ids[i]),
            transcript: transcripts[i] || "",
            language: langs[i] || "",
            sequence_number: parseInt(seqs[i]) || 0,
          });
        }
      }
      return {
        id: n.id,
        session_id: n.session_id,
        title: n.title,
        content: n.content,
        created_at: n.created_at,
        updated_at: n.updated_at,
        recordings,
      };
    });

    res.json(parsed);
  } catch (e) {
    console.error("GET /api/notes error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Create a manual note
app.post("/api/notes", (req, res) => {
  const { sessionId, title, content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: "content required" });
  const sid = sessionId || currentSessionId;
  if (!sid) return res.status(400).json({ error: "no active session" });

  try {
    const result = db.prepare(
      "INSERT INTO notes (session_id, title, content, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))"
    ).run(sid, title || "Manual Note", content);

    io.to("session:" + sid).emit("note-created", {
      noteId: result.lastInsertRowid,
      sessionId: sid,
      title: title || "Manual Note",
      content,
    });

    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Merge a recording into an existing note
app.post("/api/notes/:noteId/merge", (req, res) => {
  const { recordingId } = req.body;
  const noteId = parseInt(req.params.noteId);

  if (!recordingId) return res.status(400).json({ error: "recordingId required" });

  try {
    const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(noteId);
    if (!note) return res.status(404).json({ error: "note not found" });

    const recording = db.prepare("SELECT * FROM recordings WHERE id = ?").get(recordingId);
    if (!recording) return res.status(404).json({ error: "recording not found" });

    // Check for duplicate
    const exists = db.prepare("SELECT 1 FROM note_recordings WHERE note_id = ? AND recording_id = ?").get(noteId, recordingId);
    if (exists) return res.status(400).json({ error: "already merged" });

    // Merge: append transcript to note content
    const newContent = note.content
      ? note.content + "\n\n" + (recording.transcript || "")
      : (recording.transcript || "");

    db.prepare("UPDATE notes SET content = ?, updated_at = datetime('now') WHERE id = ?").run(newContent, noteId);
    db.prepare("INSERT INTO note_recordings (note_id, recording_id) VALUES (?, ?)").run(noteId, recordingId);

    // Update title if it was "Recording N"
    if (note.title.startsWith("Recording ")) {
      db.prepare("UPDATE notes SET title = ? WHERE id = ?").run(`Note (from ${note.title})`, noteId);
    }

    console.log(`[MERGE] Recording ${recordingId} merged into note ${noteId}`);

    io.to("session:" + note.session_id).emit("note-updated", {
      noteId,
      sessionId: note.session_id,
      title: note.title.startsWith("Recording ") ? `Note (from ${note.title})` : note.title,
      content: newContent,
    });

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete a note (not recordings)
app.delete("/api/notes/:id", (req, res) => {
  try {
    const note = db.prepare("SELECT session_id FROM notes WHERE id = ?").get(req.params.id);
    db.prepare("DELETE FROM note_recordings WHERE note_id = ?").run(req.params.id);
    db.prepare("DELETE FROM notes WHERE id = ?").run(req.params.id);
    if (note) {
      io.to("session:" + note.session_id).emit("note-deleted", {
        noteId: parseInt(req.params.id),
        sessionId: note.session_id,
      });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════
// SESSIONS API
// ═══════════════════════════════════════════════
app.get("/sessions", (req, res) => {
  try {
    const sessions = db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM recordings WHERE session_id = s.id) as recording_count,
        (SELECT COUNT(*) FROM notes WHERE session_id = s.id) as note_count
      FROM sessions s
      ORDER BY s.created_at DESC
    `).all();
    res.json(sessions);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/sessions/:id", (req, res) => {
  try {
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id);
    if (!session) return res.status(404).json({ error: "not found" });

    const recordings = db.prepare(
      "SELECT * FROM recordings WHERE session_id = ? ORDER BY sequence_number ASC"
    ).all(req.params.id);

    const notes = db.prepare(
      "SELECT * FROM notes WHERE session_id = ? ORDER BY created_at ASC"
    ).all(req.params.id);

    res.json({ ...session, recordings, notes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/sessions/:id/title", (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: "title required" });
  try {
    db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(title, req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════
app.get("/student", (req, res) => res.sendFile(path.join(__dirname, "../public/student.html")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../public/teacher.html")));
app.get("/server-ip", (req, res) => res.json({ ip: LOCAL_IP, port: PORT }));
app.get("/current-session", (req, res) => {
  res.json({ sessionId: currentSessionId });
});

// ═══════════════════════════════════════════════
// SOCKET.IO
// ═══════════════════════════════════════════════
const studentSockets = new Set();
const socketSessionMap = new Map();
let teacherSocketId = null;

io.on("connection", (socket) => {
  const clientType = socket.handshake.query.type;

  if (clientType === "student") {
    studentSockets.add(socket.id);
    io.emit("student-count", studentSockets.size);
    socket.emit("layout-update", activeLanguages);

    socket.on("join-session", (sessionId) => {
      const sid = parseInt(sessionId) || currentSessionId;
      if (!sid) return;

      const prevRoom = socketSessionMap.get(socket.id);
      if (prevRoom) socket.leave("session:" + prevRoom);

      socketSessionMap.set(socket.id, sid);
      socket.join("session:" + sid);

      const notes = db.prepare(
        "SELECT id, session_id, title, content, created_at, updated_at FROM notes WHERE session_id = ? ORDER BY created_at ASC"
      ).all(sid);
      socket.emit("session-notes", { sessionId: sid, notes });
    });
  } else {
    teacherSocketId = socket.id;
    if (currentSessionId) {
      socket.join("session:" + currentSessionId);
    }
    socket.emit("layout-update", activeLanguages);
    
    socket.on("set-layout", (langs) => {
      if (Array.isArray(langs)) {
        activeLanguages = langs;
        io.emit("layout-update", activeLanguages);
      }
    });

    socket.on("set-isl", (visible) => {
      io.emit("isl-visibility", visible);
    });
  }

  socket.on("disconnect", () => {
    if (studentSockets.has(socket.id)) {
      studentSockets.delete(socket.id);
      socketSessionMap.delete(socket.id);
      io.emit("student-count", studentSockets.size);
    }
    if (teacherSocketId === socket.id) teacherSocketId = null;
  });
});

// ═══════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
const LOCAL_IP = getLocalIP();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Student: http://${LOCAL_IP}:${PORT}/student`);
});

process.on("SIGINT", () => { endCurrentSession(); db.close(); process.exit(0); });
process.on("SIGTERM", () => { endCurrentSession(); db.close(); process.exit(0); });
