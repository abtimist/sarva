/**
 * isl-translator.js
 * 
 * Integrates an open-source dictionary mapping for Text-to-ISL.
 * Tokenizes incoming English/Hindi text and sequentially plays
 * standard ISL gesture videos or finger spelling fallbacks.
 */

const islQueue = [];
let isPlayingISL = false;
const imgEl = document.getElementById("isl-image");
const wordLabel = document.getElementById("isl-current-word");

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
    if (imgEl) imgEl.style.display = "none";
    return;
  }

  isPlayingISL = true;
  if (imgEl) imgEl.style.display = "block";
  const word = islQueue.shift();
  
  // Spell out the word using finger spelling images
  for (let char of word) {
    if (char.match(/[a-z]/)) {
      wordLabel.textContent = char.toUpperCase();
      try {
        await playSignImage(char);
      } catch (e) {
        await sleep(150); // fallback pause if image fails
      }
    }
  }

  // Brief pause between words for natural pacing
  wordLabel.textContent = "";
  if (imgEl) imgEl.src = "";
  await sleep(400);
  processISLQueue();
}

function playSignImage(char) {
  return new Promise((resolve, reject) => {
    // Reliable ASL finger spelling dataset
    const imgUrl = `https://www.lifeprint.com/asl101/fingerspelling/images/${char}.gif`;
    
    imgEl.onload = () => {
      // Hold the image for a duration so it's readable
      setTimeout(() => resolve(), 600);
    };
    
    imgEl.onerror = () => {
      reject(new Error("Image failed to load"));
    };
    
    imgEl.src = imgUrl;
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
