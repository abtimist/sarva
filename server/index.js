const express = require("express");
const http = require("http");
const os = require("os");

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
const path = require("path");
const FormData = require("form-data");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

const upload = multer({ dest: "/tmp/audio-uploads/" });
let isRecording = false;

const LANGUAGES = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  kn: "Kannada",
  te: "Telugu",
  ml: "Malayalam",
};

async function translateText(text, targetLang) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await axios.get(url);
    return res.data[0].map((item) => item[0]).join("");
  } catch (e) {
    console.error("Translation error:", e.message);
    return text;
  }
}
app.post("/recording/start", (req, res) => {
  isRecording = true;
  console.log("Recording started");
  res.json({ ok: true });
});

app.post("/recording/stop", (req, res) => {
  isRecording = false;
  console.log("Recording stopped");
  res.json({ ok: true });
});
app.post("/audio-chunk", upload.single("audio"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  if (!isRecording) {
  if (req.file) fs.unlinkSync(req.file.path);
  return res.json({ ok: true, text: "" });
}

  try {
    const form = new FormData();
    form.append("audio", fs.createReadStream(req.file.path), {
      filename: "audio.webm",
      contentType: "audio/webm",
    });

    const transcribeRes = await axios.post(
      "http://localhost:5001/transcribe",
      form,
      { headers: form.getHeaders(), timeout: 30000 }
    );

    const originalText = transcribeRes.data.text;
    if (!originalText || originalText.trim() === "") {
      fs.unlinkSync(req.file.path);
      return res.json({ ok: true, text: "" });
    }

    console.log("Transcribed:", originalText);

    const translations = await Promise.all(
      Object.keys(LANGUAGES).map((lang) =>
        translateText(originalText, lang).then((t) => [lang, t])
      )
    );

    const payload = { original: originalText };
translations.forEach(([lang, text]) => {
  payload[lang] = text;
});
// original is raw transcription — may be any language
// en field is always the English translation
console.log("Broadcasting:", payload);

    console.log("Broadcasting:", payload);
    io.emit("caption", payload);

    fs.unlinkSync(req.file.path);
    res.json({ ok: true });
  } catch (e) {
    console.error("Error:", e.message);
    fs.unlinkSync(req.file?.path || "");
    res.status(500).json({ error: e.message });
  }
});

app.get("/student", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/student.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/teacher.html"));
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
});

const PORT = 3000;
const LOCAL_IP = getLocalIP();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Student URL (for QR): http://${LOCAL_IP}:${PORT}/student`);
  console.log(`Share this URL with students or let them scan the QR code`);
});

app.get("/server-ip", (req, res) => {
  res.json({ ip: LOCAL_IP, port: PORT });
});