const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "../../data/sarva.db");
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
`);

try {
  db.prepare("SELECT recording_id FROM transcripts LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE transcripts ADD COLUMN recording_id INTEGER");
}

module.exports = db;
