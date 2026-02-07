
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
 * 2. DEEPSEEK API CALLER (Task C)
 * Generates Translation, Definition, and Example.
 */
async function generateContextData(words: string[]): Promise<WordExtractionResult[]> {
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
        temperature: 1.1,
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
 * 3. HYBRID ORCHESTRATOR
 * Runs Dictionary and AI tasks simultaneously.
 */
export const extractWords = async (wordList: string[]): Promise<WordExtractionResult[]> => {
  if (wordList.length === 0) return [];

  console.log("Starting Hybrid Extraction for:", wordList);

  try {
    const dictionaryTask = Promise.all(wordList.map(w => fetchDictionaryData(w)));
    const aiTask = generateContextData(wordList);

    const [dictResults, aiResults] = await Promise.all([dictionaryTask, aiTask]);

    const dictMap = new Map<string, DictionaryResult>();
    dictResults.forEach(d => dictMap.set(d.word.toLowerCase(), d));

    const finalCards: WordExtractionResult[] = aiResults.map((aiItem) => {
      const dictItem = dictMap.get(aiItem.word.toLowerCase());
      const finalIpa = (dictItem?.found && dictItem.ipa) ? dictItem.ipa : (aiItem as any).fallback_ipa || "";
      
      return {
        word: aiItem.word,
        ipa: finalIpa,
        audio: dictItem?.audio,
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
 * EVALUATE ANSWER (UPDATED FOR SENTENCE BUILDER)
 */
export const evaluateAnswer = async (
  word: string,
  context: string,
  userAnswer: string,
  testType: 'TRANSLATION' | 'SENTENCE'
): Promise<{ correct: boolean; feedback: string }> => {
  if (!userAnswer.trim()) return { correct: false, feedback: "Javob kiritilmadi." };

  let systemPrompt = "";
  let userPrompt = "";

  if (testType === 'SENTENCE') {
    // Logic for Sentence Builder: Grammar Check
    systemPrompt = `You are an English Grammar Teacher. 
    The user must write a sentence using the target word.
    Analyze the user's sentence for:
    1. Correct usage of the target word.
    2. Grammar and syntax accuracy.
    
    Output strictly valid JSON: { "correct": boolean, "feedback": "Brief explanation of grammar errors or praise in Uzbek." }`;
    
    userPrompt = `Target Word: "${word}"\nUser Sentence: "${userAnswer}"`;
  } else {
    // Logic for Translation Test
    systemPrompt = `You are an English tutor. Output strictly valid JSON: { "correct": boolean, "feedback": "Uzbek explanation" }`;
    userPrompt = `Task: Translate "${word}" to Uzbek.\nContext/Definition: ${context}\nUser Answer: ${userAnswer}`;
  }

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
    
    if (!res.ok) throw new Error("AI API Error");
    
    const data = await res.json();
    const content = data.choices[0].message.content;
    return JSON.parse(content);
  } catch (e) {
    console.error(e);
    return { correct: false, feedback: "AI bilan aloqa xatosi. Qaytadan urinib ko'ring." };
  }
};
