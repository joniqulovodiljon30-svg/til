
import { WordExtractionResult } from "../types";

const BASE_URL = "https://api.deepseek.com/chat/completions";

// API Kalitni olish funksiyasi
const getApiKey = (): string => {
  // 1. Vite standarti (Tavsiya etiladi: Vercel da VITE_DEEPSEEK_API_KEY deb nomlang)
  // @ts-ignore
  if (import.meta.env && import.meta.env.VITE_DEEPSEEK_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_DEEPSEEK_API_KEY;
  }

  // 2. Ehtiyot chorasi (Agar bundler process.env ni qo'llasa)
  try {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
      if (process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY) return process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY;
    }
  } catch (e) {
    // ignore error
  }

  return "";
};

const API_KEY = getApiKey();

/**
 * Helper function to call DeepSeek API (OpenAI Compatible)
 */
async function callDeepSeek(messages: { role: string; content: string }[]): Promise<string> {
  if (!API_KEY) {
    throw new Error(
      "API Kalit topilmadi!\n\n" +
      "1. Vercel loyiha sozlamalariga kiring.\n" +
      "2. 'DEEPSEEK_API_KEY' nomini 'VITE_DEEPSEEK_API_KEY' ga o'zgartiring.\n" +
      "3. Loyihani qayta deploy qiling (Redeploy)."
    );
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
        response_format: { type: "json_object" },
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
  const systemPrompt = `You are a professional Flashcard Generation System.
Input: A list of English words (which may contain numbers, hyphens, or translations like "1. Ability - Qobiliyat").
Output: A valid JSON Array.

Task:
1. Extract ONLY the English word from the input. Ignore numbers (1., 2.), symbols (-), and provided translations.
2. Generate the following details for each extracted English word:
   - "word" (Capitalized English word)
   - "ipa" (IPA pronunciation, e.g., /wɜːrd/)
   - "translation" (Correct Uzbek translation)
   - "definition" (Simple English definition, max 12 words)
   - "example" (Short example sentence)

Ensure the output is strictly a valid JSON array.`;

  const userPrompt = `Analyze and extract English words from this list, then generate flashcards: "${input}"`;

  try {
    const jsonString = await callDeepSeek([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]);

    const parsed = JSON.parse(jsonString);
    
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (parsed.words && Array.isArray(parsed.words)) {
      return parsed.words;
    } else if (parsed.items && Array.isArray(parsed.items)) {
      return parsed.items;
    } else {
      const values = Object.values(parsed);
      for (const val of values) {
        if (Array.isArray(val)) return val as WordExtractionResult[];
      }
      return [];
    }

  } catch (error) {
    console.error("DeepSeek Extraction Error:", error);
    throw error; // Xatoni App.tsx ga uzatamiz
  }
};

/**
 * Evaluates a user's answer for Translation or Sentence Building tests using DeepSeek.
 */
export const evaluateAnswer = async (
  word: string,
  context: string,
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
