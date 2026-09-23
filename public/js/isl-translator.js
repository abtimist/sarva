/**
 * isl-translator.js
 * 
 * Integrates an open-source dictionary mapping for Text-to-ISL.
 * Tokenizes incoming English/Hindi text and sequentially plays
 * standard ISL gesture videos or finger spelling fallbacks.
 */

const islQueue = [];
let isPlayingISL = false;
const videoEl = document.getElementById("isl-video");
const wordLabel = document.getElementById("isl-current-word");

// In a full production system, this points to a robust open-source ISL bucket/API
// such as INCLUDE ISL Dataset assets or ISLTranslate repositories.
const ISL_VIDEO_BASE_URL = "https://raw.githubusercontent.com/MaitreeVaria/Indian-Sign-Language-Detection/main/assets/";
const ISL_DICTIONARY_MOCK = ["hello", "thank you", "good", "morning", "how", "are", "you", "india", "teacher", "student", "class"];

// Called globally from the socket caption event
window.playISLForText = function(text) {
  // Tokenize and clean text
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 0);

  // Add words to the play queue
  words.forEach(w => islQueue.push(w));

  if (!isPlayingISL) {
    processISLQueue();
  }
};

async function processISLQueue() {
  if (islQueue.length === 0) {
    isPlayingISL = false;
    wordLabel.textContent = "";
    videoEl.src = "";
    return;
  }

  isPlayingISL = true;
  const word = islQueue.shift();
  wordLabel.textContent = word.toUpperCase();

  try {
    await playWordVideo(word);
  } catch (error) {
    console.warn(`[ISL] Video for '${word}' failed or missing. Falling back to spelling.`);
    // If word video fails, we fallback to spelling it out letter by letter
    for (let char of word) {
      if (char.match(/[a-z]/)) {
        wordLabel.textContent = char.toUpperCase();
        try {
          await playWordVideo(char); // Finger spelling video
        } catch (e) {
          await sleep(150); // fast spelling
        }
      }
    }
  }

  // Brief pause between words for natural pacing
  await sleep(100);
  processISLQueue();
}

function playWordVideo(word) {
  return new Promise((resolve, reject) => {
    // Check dictionary (simulated)
    const hasWord = ISL_DICTIONARY_MOCK.includes(word) || word.length === 1; // 1-length is finger spelling
    
    // For MVP, if it's not in our mock dictionary, we reject immediately to trigger finger-spelling
    if (!hasWord) return reject(new Error("Word not in mock dictionary"));

    // Set video source to a known valid MP4 for demonstration
    // NOTE: Replace this with the actual Open Source ISL project video CDN in production
    videoEl.src = "https://www.w3schools.com/html/mov_bbb.mp4"; 
    
    const simulatePlayback = true; 
    
    if (simulatePlayback) {
      // Simulate playback time based on word length
      setTimeout(() => resolve(), 600 + (word.length * 50));
    } else {
      videoEl.play().catch(reject);
      videoEl.onended = resolve;
      videoEl.onerror = reject;
    }
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
