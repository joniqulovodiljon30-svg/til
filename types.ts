
export interface Flashcard {
  id: string;
  word: string;
  ipa: string;
  audio?: string; // New field for pronunciation audio URL
  translation: string;
  definition: string;
  example: string;
  batchId: string; // To group by 12 (e.g., "2023-10-27-Batch-1")
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

// Deprecated/Legacy types kept minimal if needed, or removed if unused
export interface Feedback {
  correct: boolean;
  explanation: string;
}
