
import { GoogleGenAI, Type } from "@google/genai";
import { WordExtractionResult } from "../types";

// Faqat siz taqdim etgan API KEY ishlatiladi
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Pro AI Flashcard Generator.
 * Generates Word, IPA, Translation, Definition, and Example.
 */
export const extractWords = async (input: string): Promise<WordExtractionResult[]> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze these words for a flashcard system: "${input}"`,
    config: {
      systemInstruction: `You are a professional Flashcard Generation System.
      Input: A list of English words.
      Output: JSON Array.
      For each word, provide:
      1. word (The original word, capitalized)
      2. ipa (International Phonetic Alphabet pronunciation, e.g., /wɜːrd/)
      3. translation (Uzbek translation)
      4. definition (A simple, learner-friendly English definition, max 12 words)
      5. example (A short example sentence using the word)
      
      Strictly follow this JSON schema.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING },
            ipa: { type: Type.STRING },
            translation: { type: Type.STRING },
            definition: { type: Type.STRING },
            example: { type: Type.STRING }
          },
          required: ["word", "ipa", "translation", "definition", "example"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Pro AI xatolik:", error);
    return [];
  }
};

/**
 * Evaluates a user's answer for Translation or Sentence Building tests.
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

  const prompt = testType === 'TRANSLATION'
    ? `Task: Evaluate translation. Word: "${word}". Correct Meaning: "${context}". User Input: "${userAnswer}".
       Is the user's translation correct/synonymous in Uzbek? Ignore minor typos.`
    : `Task: Evaluate sentence usage. Word: "${word}". Definition: "${context}". User Input: "${userAnswer}".
       Did the user use the word "${word}" correctly in a new English sentence? Is the grammar acceptable?`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          correct: { type: Type.BOOLEAN },
          feedback: { type: Type.STRING }
        },
        required: ["correct", "feedback"]
      }
    }
  });

  try {
    const result = JSON.parse(response.text || "{}");
    return {
      correct: result.correct ?? false,
      feedback: result.feedback || "Tizim javobni tahlil qila olmadi."
    };
  } catch (e) {
    return { correct: false, feedback: "AI xatoligi yuz berdi." };
  }
};
