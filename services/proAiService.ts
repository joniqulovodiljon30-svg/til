
import { GoogleGenAI, Type } from "@google/genai";
import { WordExtractionResult, Feedback } from "../types";

// Faqat siz taqdim etgan API KEY ishlatiladi
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Pro AI So'zlarni tarjima qilish va ajratish xizmati.
 */
export const extractWords = async (input: string): Promise<WordExtractionResult[]> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Translate and process these English words into Uzbek: "${input}"`,
    config: {
      systemInstruction: `Siz "Pro AI" professional ta'lim tizimisiz. 
Vazifangiz: Berilgan inglizcha so'zlarni o'zbekchaga tarjima qilish va turini (noun, verb, adj) aniqlash.
Faqat JSON qaytaring. O'zingizni doimo "Pro AI" deb hisoblang.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING },
            translation: { type: Type.STRING },
            type: { type: Type.STRING }
          },
          required: ["word", "translation", "type"]
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
 * Pro AI Grammatika va Gap tuzishni tekshirish xizmati.
 */
export const checkSentenceResult = async (word: string, sentence: string): Promise<Feedback> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Target word: ${word}\nSentence: ${sentence}`,
      config: {
        systemInstruction: `Siz "Pro AI" professional ingliz tili o'qituvchisisiz. 
Gapda so'zning to'g'ri ishlatilganini va grammatikani tekshiring. 
Tushuntirishni faqat o'zbek tilida, qisqa va aniq bering.
Faqat JSON qaytaring.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING },
            sentence: { type: Type.STRING },
            correct: { type: Type.BOOLEAN },
            explanation: { type: Type.STRING },
            correct_sentence: { type: Type.STRING }
          },
          required: ["word", "sentence", "correct", "explanation"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    return {
      word,
      sentence,
      correct: false,
      explanation: "Pro AI tizimida ulanish xatoligi."
    };
  }
};

/**
 * Pro AI Tarjima aniqligini tekshirish xizmati.
 */
export const checkTranslationResult = async (word: string, answer: string): Promise<Feedback> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Word: ${word}, Answer: ${answer}`,
      config: {
        systemInstruction: `Siz "Pro AI" tarjima nazoratchisisiz. Tarjima to'g'riligini tekshiring. 
Faqat JSON qaytaring.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            correct: { type: Type.BOOLEAN },
            explanation: { type: Type.STRING },
            correct_sentence: { type: Type.STRING }
          },
          required: ["correct", "explanation", "correct_sentence"]
        }
      }
    });
    
    return JSON.parse(response.text || "{}");
  } catch (error) {
    return { word, correct: false, explanation: "Xatolik." };
  }
};
