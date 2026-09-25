const { GoogleGenAI } = require('@google/genai');

async function generateSmartNote(transcriptText) {
  if (!transcriptText || transcriptText.trim() === "") return "";
  
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const prompt = `You are an expert teacher's assistant. Take the following lecture transcript and summarize it into 3 clearly formatted parts using Markdown.
Format your response exactly like this:
### 📝 Summary
[A short, cohesive summary paragraph of what was discussed]

### 📌 Key Topics
- [Bullet point 1]
- [Bullet point 2]
- [Bullet point 3-5]

### 💡 Important Terms
- **[Term 1]**: [Brief definition/context]
- **[Term 2]**: [Brief definition/context]

Transcript to process:
"""
${transcriptText}
"""
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });
    return response.text;
  } catch (e) {
    console.error("Gemini API Error:", e);
    // fallback to original transcript if it fails
    return transcriptText; 
  }
}

module.exports = { generateSmartNote };
