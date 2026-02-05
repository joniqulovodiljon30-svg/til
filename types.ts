
export enum GameMode {
  TRANSLATION = 'TRANSLATION',
  SENTENCE_BUILDING = 'SENTENCE_BUILDING'
}

export interface WordStats {
  timesAsked: number;
  correctCount: number;
  lastResult: 'correct' | 'incorrect' | null;
}

export interface Word {
  id: string;
  english: string;
  uzbek: string;
  type: string;
  createdAt: number;
  stats: WordStats;
}

export interface Feedback {
  word: string;
  sentence?: string;
  translation?: string;
  part_of_speech?: string;
  correct: boolean;
  explanation: string;
  correct_sentence?: string;
  saved?: boolean;
}

export interface WordExtractionResult {
  word: string;
  translation: string;
  type: string;
}
