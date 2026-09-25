let socket;

function connectSocket() {
  socket = io(window.location.origin, {
    query: { type: "student" },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  socket.on("connect", () => {
    const dot = document.getElementById("connected-dot");
    dot.classList.add("on");
    dot.classList.remove("reconnecting");
    document.getElementById("conn-text").textContent = "Connected";
  });

  socket.on("disconnect", () => {
    const dot = document.getElementById("connected-dot");
    dot.classList.remove("on");
    dot.classList.add("reconnecting");
    document.getElementById("conn-text").textContent = "Reconnecting...";
  });

  socket.on("reconnect_attempt", (attempt) => {
    document.getElementById("conn-text").textContent = `Reconnecting... (${attempt})`;
  });

  socket.on("reconnect_failed", () => {
    document.getElementById("connected-dot").classList.remove("reconnecting");
    document.getElementById("conn-text").textContent = "Lost. Refresh page.";
  });

  socket.on("caption", (data) => {
    document.getElementById("waiting")?.remove();
    document.getElementById("listen-dots")?.classList.remove("active");
    handleCaption(data);
  });
}

connectSocket();

// ── Student Notes ──
let studentSessionId = null;
let studentNotes = [];

async function loadStudentSession() {
  try {
    const r = await fetch("/current-session");
    const data = await r.json();
    studentSessionId = data.sessionId;
    if (studentSessionId && socket && socket.connected) {
      socket.emit("join-session", studentSessionId);
    }
  } catch (e) {
    console.error("Failed to load session:", e);
  }
}

function renderStudentNotes() {
  const list = document.getElementById("student-notes-list");
  const empty = document.getElementById("student-notes-empty");
  const badge = document.getElementById("snotes-badge");

  badge.textContent = studentNotes.length;

  if (studentNotes.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  list.innerHTML = "";
  studentNotes.forEach(n => {
    const card = document.createElement("div");
    card.className = "snote-card";
    card.dataset.noteId = n.id;

    const time = n.created_at
      ? new Date(n.created_at + "Z").toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      : "";

    card.innerHTML = `
      <div class="snote-card-header">
        <div class="snote-card-title">${esc(n.title || "Note")}</div>
        <div class="snote-card-time">${time}</div>
      </div>
      <div class="snote-card-content">${esc(n.content || "")}</div>
    `;
    list.appendChild(card);
  });

  list.scrollTop = list.scrollHeight;
}

function toggleNotes() {
  const overlay = document.getElementById("student-notes-overlay");
  const drawer = document.getElementById("student-notes-drawer");
  overlay.classList.toggle("open");
  drawer.classList.toggle("open");
}

function upsertStudentNote(data) {
  const idx = studentNotes.findIndex(n => n.id === data.noteId);
  const note = {
    id: data.noteId,
    session_id: data.sessionId,
    title: data.title || "Note",
    content: data.content || "",
    created_at: data.created_at || new Date().toISOString().replace("T", " ").slice(0, 19),
  };
  if (idx >= 0) {
    studentNotes[idx].content = note.content;
    studentNotes[idx].title = note.title;
  } else {
    studentNotes.push(note);
  }
  renderStudentNotes();
}

function removeStudentNote(data) {
  studentNotes = studentNotes.filter(n => n.id !== data.noteId);
  renderStudentNotes();
}

// ── Socket: join session + note events ──
function setupStudentSocket() {
  socket.on("connect", () => {
    loadStudentSession();
  });

  socket.on("session-notes", (data) => {
    studentSessionId = data.sessionId;
    studentNotes = data.notes || [];
    renderStudentNotes();
  });

  socket.on("note-created", (data) => {
    if (data.sessionId == studentSessionId) {
      upsertStudentNote(data);
    }
  });

  socket.on("note-updated", (data) => {
    if (data.sessionId == studentSessionId) {
      upsertStudentNote(data);
    }
  });

  socket.on("note-deleted", (data) => {
    if (data.sessionId == studentSessionId) {
      removeStudentNote(data);
    }
  });
}

setupStudentSocket();
// If already connected, join now
if (socket && socket.connected) loadStudentSession();

// ── Auto-detect browser language ──
function detectBrowserLang() {
  const nav = navigator.language || navigator.userLanguage || "en";
  const code = nav.split("-")[0];
  const langMap = { en: "en", hi: "hi", ta: "ta", kn: "kn", te: "te", ml: "ml" };
  return langMap[code] || "en";
}

let selectedLang = detectBrowserLang();
let showDual = true;
const captionBuffer = [];
let currentFontSize = 1.4;

// Auto-select on load
const autoBtn = document.querySelector(`.lang-btn[data-lang="${selectedLang}"]`);
if (autoBtn) {
  document.querySelectorAll(".lang-btn").forEach(b => b.classList.remove("active"));
  autoBtn.classList.add("active");
}

function changeFontSize(delta) {
  currentFontSize = Math.min(2.8, Math.max(0.85, currentFontSize + delta));
  document.documentElement.style.setProperty('--primary-size', currentFontSize + 'rem');
  document.documentElement.style.setProperty('--secondary-size', (currentFontSize * 0.65) + 'rem');
}

function setLang(btn) {
  document.querySelectorAll(".lang-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  selectedLang = btn.dataset.lang;
  // Don't clear buffer — just re-render with new lang
  renderBuffer();
}

function handleCaption(data) {
  captionBuffer.push(data);
  if (captionBuffer.length > 8) captionBuffer.shift();
  renderBuffer();
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function renderBuffer() {
  const container = document.getElementById("captions");
  container.innerHTML = "";

  if (captionBuffer.length === 0) {
    container.innerHTML = '<div id="waiting">Waiting for teacher to start speaking...</div><div class="listening-dots active" id="listen-dots"><span></span><span></span><span></span></div>';
    return;
  }

  const area = document.createElement("div");
  area.className = "caption-area";

  const primaryText = captionBuffer.map(d => d[selectedLang] || "").join(" ").trim();
  const primary = document.createElement("div");
  primary.className = "caption-primary";
  primary.textContent = primaryText;
  const cursor = document.createElement("span");
  cursor.className = "cursor";
  primary.appendChild(cursor);
  area.appendChild(primary);

  if (selectedLang !== "en") {
    const enTexts = captionBuffer.map(d => d.en || "").filter(t => t);
    const enFull = enTexts.join(" ");
    if (enFull && enFull !== primaryText) {
      const secondary = document.createElement("div");
      secondary.className = "caption-secondary";
      secondary.textContent = enFull;
      area.appendChild(secondary);
    }
  }

  container.appendChild(area);
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}
