const express = require("express");
const multer = require("multer");
const os = require("os");
const path = require("path");
const fs = require("fs");
const db = require("../db");
const { transcribeAudio } = require("../services/transcribe");
const { translateAll } = require("../services/translate");

const router = express.Router();

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

let chunkSeq = 0;

function setChunkSeq(val) {
  chunkSeq = val;
}

function getChunkSeq() {
  return chunkSeq;
}

async function processChunk(filePath, seq, recId, sessId, startTime, io) {
  try {
    const { text: originalText, language: detectedLang } = await transcribeAudio(filePath);
    try { fs.unlinkSync(filePath); } catch {}

    if (!originalText || originalText.trim().length < 4) return;

    const translations = await translateAll(originalText);
    const payload = {
      seq,
      original: originalText,
      detectedLang,
      ...translations,
      processingMs: Date.now() - startTime,
    };

    try {
      db.prepare(`
        INSERT INTO transcripts (session_id, recording_id, seq, original_text, detected_lang, en, hi, ta, kn, te, ml, processing_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(sessId, recId, seq, originalText, detectedLang, translations.en, translations.hi, translations.ta, translations.kn, translations.te, translations.ml, payload.processingMs);
    } catch (e) {
      console.error("DB error:", e.message);
    }

    io.emit("caption", payload);
  } catch (e) {
    try { fs.unlinkSync(filePath); } catch {}
    console.error("Chunk processing error:", e.message);
  }
}

router.post("/", upload.single("audio"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });

  const { isRecording, getCurrentRecordingId, getCurrentSessionId, getIo } = req.app.locals;

  if (!isRecording()) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.json({ ok: true, text: "" });
  }

  const seq = ++chunkSeq;
  const startTime = Date.now();
  const recId = getCurrentRecordingId();
  const sessId = getCurrentSessionId();
  const filePath = req.file.path;

  res.json({ ok: true });

  processChunk(filePath, seq, recId, sessId, startTime, getIo()).catch((e) => {
    console.error("Background chunk error:", e.message);
    try { fs.unlinkSync(filePath); } catch {}
  });
});

module.exports = { router, setChunkSeq, getChunkSeq };
