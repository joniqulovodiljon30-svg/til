
export type SupportedLanguage = 'en' | 'es' | 'zh';

export interface Flashcard {
  id: string;
  word: string;
  ipa: string;
  audio?: string; // Optional URL (Dictionary API for EN). If empty, Frontend uses Web Speech API.
  translation: string;
  definition: string;
  example: string;
  batchId: string;
  language: SupportedLanguage; // Used for PDF font selection and Audio generation
  createdAt: number;
}

export interface WordExtractionResult {
  word: string;
  ipa: string;
  audio?: string;
  translation: string;
  definition: string;
  example: string;
}

export interface Feedback {
  correct: boolean;
  explanation: string;
}
