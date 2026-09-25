const express = require("express");
const db = require("../db");

const router = express.Router();

// Get all notes for a session (with their recordings)
router.get("/:sessionId", (req, res) => {
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

    const parsed = notes.map((n) => {
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

// Get ALL notes across all sessions
router.get("/", (req, res) => {
  try {
    const notes = db.prepare(`
      SELECT n.*, s.title as session_title, s.created_at as session_created_at
      FROM notes n
      LEFT JOIN sessions s ON s.id = n.session_id
      ORDER BY n.created_at ASC
    `).all();
    res.json(notes);
  } catch (e) {
    console.error("GET /api/notes-all error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Create a manual note
router.post("/", (req, res) => {
  const { sessionId, title, content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: "content required" });

  const { getCurrentSessionId, getIo } = req.app.locals;
  const sid = sessionId || getCurrentSessionId();
  if (!sid) return res.status(400).json({ error: "no active session" });

  try {
    const result = db.prepare(
      "INSERT INTO notes (session_id, title, content, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))"
    ).run(sid, title || "Manual Note", content);

    getIo().to("session:" + sid).emit("note-created", {
      noteId: result.lastInsertRowid,
      sessionId: sid,
      title: title || "Manual Note",
      content,
    });

    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Merge a recording into an existing note
router.post("/:noteId/merge", (req, res) => {
  const { recordingId } = req.body;
  const noteId = parseInt(req.params.noteId);
  const { getIo } = req.app.locals;

  if (!recordingId) return res.status(400).json({ error: "recordingId required" });

  try {
    const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(noteId);
    if (!note) return res.status(404).json({ error: "note not found" });

    const recording = db.prepare("SELECT * FROM recordings WHERE id = ?").get(recordingId);
    if (!recording) return res.status(404).json({ error: "recording not found" });

    const exists = db.prepare("SELECT 1 FROM note_recordings WHERE note_id = ? AND recording_id = ?").get(noteId, recordingId);
    if (exists) return res.status(400).json({ error: "already merged" });

    const newContent = note.content
      ? note.content + "\n\n" + (recording.transcript || "")
      : recording.transcript || "";

    db.prepare("UPDATE notes SET content = ?, updated_at = datetime('now') WHERE id = ?").run(newContent, noteId);
    db.prepare("INSERT INTO note_recordings (note_id, recording_id) VALUES (?, ?)").run(noteId, recordingId);

    if (note.title.startsWith("Recording ")) {
      db.prepare("UPDATE notes SET title = ? WHERE id = ?").run(`Note (from ${note.title})`, noteId);
    }

    getIo().to("session:" + note.session_id).emit("note-updated", {
      noteId,
      sessionId: note.session_id,
      title: note.title.startsWith("Recording ") ? `Note (from ${note.title})` : note.title,
      content: newContent,
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete a note
router.delete("/:id", (req, res) => {
  const { getIo } = req.app.locals;
  try {
    const note = db.prepare("SELECT session_id FROM notes WHERE id = ?").get(req.params.id);
    db.prepare("DELETE FROM note_recordings WHERE note_id = ?").run(req.params.id);
    db.prepare("DELETE FROM notes WHERE id = ?").run(req.params.id);
    if (note) {
      getIo().to("session:" + note.session_id).emit("note-deleted", {
        noteId: parseInt(req.params.id),
        sessionId: note.session_id,
      });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
