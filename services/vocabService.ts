
import OpenAI from "openai";
import { pinyin } from "pinyin-pro";
import { getAudioUrl } from "google-tts-api";
import { WordExtractionResult, SupportedLanguage } from "../types";

// --- CONFIGURATION ---
const DEEPSEEK_API_KEY = "sk-ec020064fbb7426cb15bffb16902d982";

// Initialize OpenAI SDK for DeepSeek
const deepseek = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: DEEPSEEK_API_KEY,
  dangerouslyAllowBrowser: true // Required for client-side usage
});

// --- HELPER: AUDIO GENERATOR ---
function generateAudioLink(word: string, lang: SupportedLanguage): string {
  try {
    // google-tts-api maps: 'en'->'en', 'es'->'es', 'zh'->'zh-CN'
    const ttsLang = lang === 'zh' ? 'zh-CN' : lang;
    return getAudioUrl(word, {
      lang: ttsLang,
      slow: false,
      host: 'https://translate.google.com',
    });
  } catch (e) {
    console.warn("TTS Generation failed:", e);
    return "";
  }
}

// --- 1. DICTIONARY API (ENGLISH ONLY) ---
interface DictionaryResult {
  ipa: string;
  audio?: string;
  found: boolean;
}

async function fetchEnglishDictionaryData(word: string): Promise<DictionaryResult> {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) return { ipa: "", found: false };
    
    const data = await res.json();
    const entry = data[0];

    // IPA
    let ipa = entry.phonetic || "";
    if (!ipa && entry.phonetics?.length > 0) {
      const p = entry.phonetics.find((p: any) => p.text);
      if (p) ipa = p.text;
    }

    // Audio
    let audio = "";
    if (entry.phonetics?.length > 0) {
      const audioEntry = entry.phonetics.find((p: any) => p.audio && p.audio.includes('-us.mp3')) 
                      || entry.phonetics.find((p: any) => p.audio && p.audio !== "");
      if (audioEntry) audio = audioEntry.audio;
    }

    return { ipa, audio, found: true };
  } catch (e) {
    return { ipa: "", found: false };
  }
}

// --- 2. MAIN LOGIC ---
export const extractWords = async (wordList: string[], lang: SupportedLanguage): Promise<WordExtractionResult[]> => {
  if (wordList.length === 0) return [];
  console.log(`Processing ${wordList.length} words in ${lang}...`);

  // A. PREPARE PROMPTS FOR DEEPSEEK
  let systemPrompt = "";
  
  if (lang === 'en') {
    systemPrompt = `You are a Vocabulary Engine. Output valid JSON Array.
    For each English word:
    - "word": Capitalized English word.
    - "translation": Accurate Uzbek translation.
    - "definition": Simple English definition (A2 level).
    - "example": One clear example sentence.`;
  } else if (lang === 'es') {
    systemPrompt = `You are a Vocabulary Engine. Output valid JSON Array.
    For each Spanish word:
    - "word": The word in Spanish.
    - "translation": Accurate Uzbek translation.
    - "definition": Definition in Spanish (A2 level).
    - "example": Example sentence in Spanish.`;
  } else if (lang === 'zh') {
    systemPrompt = `You are a Vocabulary Engine. Output valid JSON Array.
    For each Chinese word (Hanzi):
    - "word": The Hanzi characters.
    - "translation": Accurate Uzbek translation.
    - "definition": Definition in Simplified Chinese (HSK level).
    - "example": Example sentence in Simplified Chinese.`;
  }

  const userPrompt = `Words: ${JSON.stringify(wordList)}`;

  try {
    // B. CALL DEEPSEEK (Parallel with Dictionary/TTS if possible, but we wait for context first)
    const completion = await deepseek.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      model: "deepseek-chat",
      response_format: { type: "json_object" },
      temperature: 1.1
    });

    const content = completion.choices[0].message.content || "{}";
    const parsed = JSON.parse(content);
    
    // Normalize response to array
    let aiResults: any[] = [];
    if (Array.isArray(parsed)) aiResults = parsed;
    else if (parsed.words) aiResults = parsed.words;
    else if (parsed.items) aiResults = parsed.items;
    else aiResults = Object.values(parsed).find(v => Array.isArray(v)) as any[] || [];

    // C. ENRICH DATA (Audio & IPA)
    const finalResults: WordExtractionResult[] = await Promise.all(aiResults.map(async (item) => {
      let finalIpa = "";
      let finalAudio = "";

      // --- ENGLISH STRATEGY ---
      if (lang === 'en') {
        const dictData = await fetchEnglishDictionaryData(item.word);
        if (dictData.found) {
          finalIpa = dictData.ipa;
          finalAudio = dictData.audio || generateAudioLink(item.word, 'en');
        } else {
          // Fallback if dict fails
          finalAudio = generateAudioLink(item.word, 'en');
          // We assume DeepSeek didn't provide IPA here to save tokens, 
          // but we could ask for it. For now, leave empty or handle in PDF.
        }
      } 
      
      // --- SPANISH STRATEGY ---
      else if (lang === 'es') {
        // DeepSeek doesn't reliably return standard IPA unless forced.
        // We will generate audio via Google TTS.
        finalAudio = generateAudioLink(item.word, 'es');
        // Ideally, we'd ask DeepSeek for IPA, but to keep it simple we rely on user reading skills or add a second call. 
        // For this version, we will leave IPA empty or assume the user can read Spanish phonetics (consistent).
      } 
      
      // --- CHINESE STRATEGY ---
      else if (lang === 'zh') {
        // Pinyin Generation
        try {
          finalIpa = pinyin(item.word, { toneType: 'mark' });
        } catch (e) {
          finalIpa = "";
        }
        // Google TTS Audio
        finalAudio = generateAudioLink(item.word, 'zh');
      }

      return {
        word: item.word,
        ipa: finalIpa,
        audio: finalAudio,
        translation: item.translation,
        definition: item.definition,
        example: item.example
      };
    }));

    return finalResults;

  } catch (error) {
    console.error("DeepSeek/Extraction Error:", error);
    throw error;
  }
};

/**
 * EVALUATE ANSWER
 */
export const evaluateAnswer = async (
  word: string,
  context: string,
  userAnswer: string,
  testType: 'TRANSLATION' | 'SENTENCE',
  lang: SupportedLanguage
): Promise<{ correct: boolean; feedback: string }> => {
  const langName = lang === 'en' ? 'English' : lang === 'es' ? 'Spanish' : 'Chinese';
  
  const systemPrompt = testType === 'SENTENCE' 
    ? `You are a ${langName} Teacher. Check if the user used "${word}" correctly in a ${langName} sentence. JSON Output: { "correct": boolean, "feedback": "Explanation in Uzbek" }`
    : `You are a ${langName} Tutor. Check translation of "${word}" (${langName}) to Uzbek. Context: ${context}. JSON Output: { "correct": boolean, "feedback": "Explanation in Uzbek" }`;

  const userPrompt = `User Answer: "${userAnswer}"`;

  try {
    const completion = await deepseek.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      model: "deepseek-chat",
      response_format: { type: "json_object" }
    });
    return JSON.parse(completion.choices[0].message.content || "{}");
  } catch (e) {
    return { correct: false, feedback: "AI Connection Error." };
  }
};
