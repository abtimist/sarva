const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", (req, res) => {
  try {
    const sessions = db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM recordings WHERE session_id = s.id) as recording_count,
        (SELECT COUNT(*) FROM notes WHERE session_id = s.id) as note_count
      FROM sessions s
      ORDER BY s.created_at DESC
    `).all();
    res.json(sessions);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:id", (req, res) => {
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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/:id/title", (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: "title required" });
  try {
    db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(title, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
