const axios = require("axios");

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
    const res = await axios.get(url, { timeout: 8000 });
    return res.data[0].map((item) => item[0]).join("");
  } catch {
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

module.exports = { translateText, translateAll, LANGUAGES };
