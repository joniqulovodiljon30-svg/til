
import { WordExtractionResult } from "../types";

// --- CONFIGURATION ---
const DEEPSEEK_API_KEY = "sk-ec020064fbb7426cb15bffb16902d982";
const BASE_URL = "https://api.deepseek.com/chat/completions";

/**
 * TYPE DEFINITIONS
 */
interface DictionaryResult {
  word: string;
  ipa: string;
  audio?: string;
  found: boolean;
}

/**
 * 1. DICTIONARY API FETCHER (Task B)
 * Fetches Phonetics and Audio specifically.
 */
async function fetchDictionaryData(word: string): Promise<DictionaryResult> {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) {
      return { word, ipa: "", found: false };
    }
    
    const data = await res.json();
    const entry = data[0];

    // Logic to find the best IPA
    let ipa = entry.phonetic || "";
    if (!ipa && entry.phonetics?.length > 0) {
      const p = entry.phonetics.find((p: any) => p.text);
      if (p) ipa = p.text;
    }

    // Logic to find the best Audio (Prefer US English)
    let audio = "";
    if (entry.phonetics?.length > 0) {
      const audioEntry = entry.phonetics.find((p: any) => p.audio && p.audio.includes('-us.mp3')) 
                      || entry.phonetics.find((p: any) => p.audio && p.audio !== "");
      if (audioEntry) audio = audioEntry.audio;
    }

    return { word, ipa, audio, found: true };
  } catch (e) {
    return { word, ipa: "", found: false };
  }
}

/**
 * 2. DEEPSEEK API CALLER (Task C + Task A Simulation)
 * Generates Translation, Definition, and Example in one optimized call.
 */
async function generateContextData(words: string[]): Promise<WordExtractionResult[]> {
  // We ask for IPA as a fallback_ipa in case Dictionary API fails
  const systemPrompt = `You are a High-Performance Vocabulary Engine.
Output strictly valid JSON Array.

For each word, provide:
- "word": Capitalized English word.
- "translation": Accurate Uzbek translation (Context: General/Academic).
- "definition": Simple English definition (A2/B1 level, max 12 words).
- "example": One clear example sentence in English.
- "fallback_ipa": An estimated IPA transcription (used only if dictionary fails).

Focus on speed and JSON validity.`;

  const userPrompt = `Process these words: ${JSON.stringify(words)}`;

  try {
    const response = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 1.1, // Slightly creative for examples
        max_tokens: 2048,
        stream: false
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`AI Error: ${err}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(content);

    // Robust parsing to handle various JSON structures
    let results: any[] = [];
    if (Array.isArray(parsed)) results = parsed;
    else if (parsed.words) results = parsed.words;
    else if (parsed.items) results = parsed.items;
    else results = Object.values(parsed).find(v => Array.isArray(v)) as any[] || [];

    return results as WordExtractionResult[];

  } catch (error) {
    console.error("DeepSeek Failed:", error);
    throw error;
  }
}

/**
 * 3. HYBRID ORCHESTRATOR (Parallel Execution)
 * Runs Task B (Dictionary) and Task C (AI) simultaneously.
 */
export const extractWords = async (input: string): Promise<WordExtractionResult[]> => {
  // A. Clean and Normalize Input
  const rawLines = input.split('\n');
  const uniqueWords = new Set<string>();
  
  rawLines.forEach(line => {
    // Remove numbers "1.", "1)"
    const cleanLine = line.replace(/^\d+[\.\)]\s*/, '').trim();
    if (!cleanLine) return;
    
    // Split by common delimiters
    const parts = cleanLine.split(/[\-–—,]/); 
    const firstPart = parts[0].trim();
    
    // Basic validation
    if (firstPart && /[a-zA-Z]/.test(firstPart)) {
      uniqueWords.add(firstPart);
    }
  });

  const wordList = Array.from(uniqueWords);
  if (wordList.length === 0) return [];

  console.log("Starting Hybrid Extraction for:", wordList);

  try {
    // B. START PARALLEL TASKS
    // Task 1: Fetch Dictionary Data for ALL words (Array of Promises)
    const dictionaryTask = Promise.all(wordList.map(w => fetchDictionaryData(w)));
    
    // Task 2: Fetch Context Data from AI (Single Batch Request)
    const aiTask = generateContextData(wordList);

    // C. AWAIT BOTH (This is the speed optimization)
    const [dictResults, aiResults] = await Promise.all([dictionaryTask, aiTask]);

    // D. MERGE DATA
    // Create a map for fast lookup of dictionary data
    const dictMap = new Map<string, DictionaryResult>();
    dictResults.forEach(d => dictMap.set(d.word.toLowerCase(), d));

    // Combine
    const finalCards: WordExtractionResult[] = aiResults.map((aiItem) => {
      const dictItem = dictMap.get(aiItem.word.toLowerCase());
      
      // Use Dictionary IPA if available, otherwise AI fallback
      const finalIpa = (dictItem?.found && dictItem.ipa) ? dictItem.ipa : (aiItem as any).fallback_ipa || "";
      
      return {
        word: aiItem.word,
        ipa: finalIpa,
        audio: dictItem?.audio, // Only from dictionary
        translation: aiItem.translation,
        definition: aiItem.definition,
        example: aiItem.example
      };
    });

    return finalCards;

  } catch (error) {
    console.error("Hybrid Flow Failed:", error);
    throw error;
  }
};

/**
 * EVALUATION SERVICE (Legacy / Unchanged)
 */
export const evaluateAnswer = async (
  word: string,
  context: string,
  userAnswer: string,
  testType: 'TRANSLATION' | 'SENTENCE'
): Promise<{ correct: boolean; feedback: string }> => {
  if (!userAnswer.trim()) return { correct: false, feedback: "Javob kiritilmadi." };

  const systemPrompt = `You are an English tutor. Output JSON: { "correct": boolean, "feedback": "Uzbek explanation" }`;
  const userPrompt = `Task: ${testType}\nWord: ${word}\nContext: ${context}\nUser Answer: ${userAnswer}`;

  try {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        response_format: { type: "json_object" }
      })
    });
    const data = await res.json();
    return JSON.parse(data.choices[0].message.content);
  } catch (e) {
    return { correct: false, feedback: "AI xatosi." };
  }
};
