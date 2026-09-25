const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");

async function transcribeAudio(filePath) {
  const transcribePort = process.env.TRANSCRIBE_PORT || 5001;

  const form = new FormData();
  form.append("audio", fs.createReadStream(filePath), {
    filename: "audio.webm",
    contentType: "audio/webm",
  });

  const res = await axios.post(
    `http://localhost:${transcribePort}/transcribe`,
    form,
    { headers: form.getHeaders(), timeout: 30000 }
  );

  return {
    text: res.data.text || "",
    language: res.data.language || null,
  };
}

module.exports = { transcribeAudio };
