export type SupportedLanguage = 'en' | 'es' | 'zh';

export interface Flashcard {
  id: string;
  word: string;
  ipa: string;
  transcription?: string; // Standardized column for IPA / transcription
  audio?: string; // Optional URL (Dictionary API for EN). If empty, Frontend uses Web Speech API.
  translation: string;
  definition: string;
  example: string;
  batchId: string;
  language: SupportedLanguage; // Used for PDF font selection and Audio generation
  createdAt: number;
  isMistake?: boolean; // Track if the card is marked as a mistake
}

export interface WordExtractionResult {
  word: string;
  ipa: string;
  transcription?: string;
  audio?: string;
  translation: string;
  definition: string;
  example: string;
}

export interface Feedback {
  correct: boolean;
  explanation: string;
}
