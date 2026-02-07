
import { WordExtractionResult } from "../types";

// DeepSeek API Configuration
// Vercel Environment Variable: DEEPSEEK_API_KEY
const API_KEY = process.env.DEEPSEEK_API_KEY;
const BASE_URL = "https://api.deepseek.com/chat/completions";

/**
 * Helper function to call DeepSeek API (OpenAI Compatible)
 */
async function callDeepSeek(messages: { role: string; content: string }[]): Promise<string> {
  if (!API_KEY) {
    throw new Error("DEEPSEEK_API_KEY topilmadi. Iltimos, Vercel sozlamalarida kalitni to'g'ri kiriting.");
  }

  try {
    const response = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: messages,
        response_format: { type: "json_object" }, // JSON formatni majburlash
        temperature: 1.0,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API Xatolik: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (error) {
    console.error("API Call Failed:", error);
    throw error;
  }
}

/**
 * DeepSeek Flashcard Generator.
 * Generates Word, IPA, Translation, Definition, and Example.
 */
export const extractWords = async (input: string): Promise<WordExtractionResult[]> => {
  // DeepSeek JSON mode requires the word "json" in the prompt
  const systemPrompt = `You are a professional Flashcard Generation System.
Input: A list of English words.
Output: A valid JSON Array.

For each word, provide an object with these exact keys:
1. "word" (The original word, capitalized)
2. "ipa" (International Phonetic Alphabet pronunciation, e.g., /wɜːrd/)
3. "translation" (Uzbek translation)
4. "definition" (A simple, learner-friendly English definition, max 12 words)
5. "example" (A short example sentence using the word)

Ensure the output is strictly valid JSON array.`;

  const userPrompt = `Analyze these words for a flashcard system: "${input}"`;

  try {
    const jsonString = await callDeepSeek([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]);

    // Parse the result
    const parsed = JSON.parse(jsonString);
    
    // Handle different JSON structures DeepSeek might return
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (parsed.words && Array.isArray(parsed.words)) {
      return parsed.words;
    } else if (parsed.items && Array.isArray(parsed.items)) {
      return parsed.items;
    } else {
      // Fallback: try to find any array in the object values
      const values = Object.values(parsed);
      for (const val of values) {
        if (Array.isArray(val)) return val as WordExtractionResult[];
      }
      return [];
    }

  } catch (error) {
    console.error("DeepSeek Extraction Error:", error);
    return [];
  }
};

/**
 * Evaluates a user's answer for Translation or Sentence Building tests using DeepSeek.
 */
export const evaluateAnswer = async (
  word: string,
  context: string, // definition or translation to check against
  userAnswer: string,
  testType: 'TRANSLATION' | 'SENTENCE'
): Promise<{ correct: boolean; feedback: string }> => {
  if (!userAnswer.trim()) {
    return { correct: false, feedback: "Javob kiritilmadi." };
  }

  const systemPrompt = `You are an English language tutor evaluation system. 
You must output a strictly valid JSON object with keys: "correct" (boolean) and "feedback" (string, in Uzbek).`;

  let taskPrompt = "";
  if (testType === 'TRANSLATION') {
    taskPrompt = `Task: Evaluate translation.
Word: "${word}"
Correct Meaning: "${context}"
User Input: "${userAnswer}"
Is the user's translation correct/synonymous in Uzbek? Ignore minor typos.
Output JSON: { "correct": boolean, "feedback": "Explanation in Uzbek" }`;
  } else {
    taskPrompt = `Task: Evaluate sentence usage.
Word: "${word}"
Definition: "${context}"
User Input: "${userAnswer}"
Did the user use the word "${word}" correctly in a new English sentence? Is the grammar acceptable?
Output JSON: { "correct": boolean, "feedback": "Explanation in Uzbek" }`;
  }

  try {
    const jsonString = await callDeepSeek([
      { role: "system", content: systemPrompt },
      { role: "user", content: taskPrompt }
    ]);

    const result = JSON.parse(jsonString);
    return {
      correct: result.correct ?? false,
      feedback: result.feedback || "Tizim javobni tahlil qila olmadi."
    };
  } catch (e) {
    console.error("DeepSeek Eval Error:", e);
    return { correct: false, feedback: "AI bilan aloqa xatosi." };
  }
};
