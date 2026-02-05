
import React, { useState, useEffect, useRef } from 'react';
import { Word, GameMode, Feedback } from '../types';
import { checkTranslationResult, checkSentenceResult } from '../services/proAiService';

interface GameProps {
  words: Word[];
  mode: GameMode;
  sentenceCache: Record<string, Feedback>;
  onExit: () => void;
  onUpdateStats: (wordId: string, isCorrect: boolean) => void;
  onCacheSentence: (word: string, sentence: string, feedback: Feedback) => void;
}

const Game: React.FC<GameProps> = ({ words, mode, sentenceCache, onExit, onUpdateStats, onCacheSentence }) => {
  const [currentWord, setCurrentWord] = useState<Word | null>(null);
  const [userInput, setUserInput] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [score, setScore] = useState(0);
  const [totalAttempted, setTotalAttempted] = useState(0);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const selectNextWord = () => {
    if (words.length === 0) return;
    const weights = words.map(w => {
      if (w.stats.timesAsked === 0) return 10;
      const accuracy = w.stats.correctCount / w.stats.timesAsked;
      return 1 + (1 - accuracy) * 15;
    });
    const totalWeight = weights.reduce((acc, w) => acc + w, 0);
    let random = Math.random() * totalWeight;
    for (let i = 0; i < words.length; i++) {
      if (random < weights[i]) {
        setCurrentWord(words[i]);
        return;
      }
      random -= weights[i];
    }
    setCurrentWord(words[0]);
  };

  useEffect(() => {
    selectNextWord();
  }, []);

  useEffect(() => {
    if (!isChecking && !feedback) {
      inputRef.current?.focus();
    }
  }, [isChecking, feedback, currentWord]);

  const handleCheck = async () => {
    if (!userInput.trim() || !currentWord) return;
    setIsChecking(true);
    
    try {
      let result: Feedback;
      
      if (mode === GameMode.TRANSLATION) {
        result = await checkTranslationResult(currentWord.english, userInput);
      } else {
        const cacheKey = `${currentWord.english.toLowerCase()}:${userInput.toLowerCase().trim()}`;
        if (sentenceCache[cacheKey]) {
          result = { ...sentenceCache[cacheKey], saved: true };
        } else {
          result = await checkSentenceResult(currentWord.english, userInput);
          onCacheSentence(currentWord.english, userInput, result);
        }
      }

      setFeedback(result);
      setTotalAttempted(prev => prev + 1);
      if (result.correct) {
        setScore(prev => prev + 1);
      }
      onUpdateStats(currentWord.id, result.correct);
    } catch (error) {
      alert("Pro AI xatoligi: " + (error as Error).message);
    } finally {
      setIsChecking(false);
    }
  };

  const nextRound = () => {
    setUserInput('');
    setFeedback(null);
    selectNextWord();
  };

  if (!currentWord) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex justify-between items-center px-2">
        <button 
          onClick={onExit}
          className="text-slate-400 hover:text-slate-900 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          CHIQUISH
        </button>
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white border border-slate-100 px-4 py-2 rounded-full shadow-sm">
          HISOB: <span className="text-slate-900">{score}</span> / {totalAttempted}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-2xl shadow-slate-200 border border-slate-200 overflow-hidden">
        <div className={`h-1.5 w-full ${mode === GameMode.TRANSLATION ? 'bg-slate-900' : 'bg-slate-400'}`} />
        
        <div className="p-8 md:p-14 text-center">
          <div className="mb-2 text-[10px] text-slate-400 font-black uppercase tracking-[0.3em]">
            {mode === GameMode.TRANSLATION ? 'TARJIMA' : 'GAP TUZING'}
          </div>
          <h2 className="text-4xl md:text-6xl font-black text-slate-900 mb-2 tracking-tighter">{currentWord.english}</h2>
          <div className="inline-block px-4 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-[10px] font-black text-slate-400 uppercase tracking-widest mb-12">
            {currentWord.type || 'NOMA\'LUM'}
          </div>

          <div className="space-y-6">
            {!feedback ? (
              <>
                {mode === GameMode.TRANSLATION ? (
                  <input
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    type="text"
                    className="w-full p-4 border border-slate-200 rounded-lg focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-all text-xl text-center placeholder:text-slate-200 font-medium"
                    placeholder="O'zbekcha tarjima..."
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
                    disabled={isChecking}
                  />
                ) : (
                  <textarea
                    ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                    className="w-full p-4 border border-slate-200 rounded-lg focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-all text-lg h-32 placeholder:text-slate-200 font-medium"
                    placeholder="Inglizcha gap yozing..."
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && e.ctrlKey && handleCheck()}
                    disabled={isChecking}
                  />
                )}

                <button
                  onClick={handleCheck}
                  disabled={isChecking || !userInput.trim()}
                  className={`w-full py-5 rounded-lg font-black text-xs tracking-[0.2em] transition-all shadow-md uppercase ${
                    isChecking || !userInput.trim()
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                      : 'bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98] shadow-slate-200'
                  }`}
                >
                  {isChecking ? 'TEKSHIRILMOQDA...' : 'TEKSHIRISH'}
                </button>
              </>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className={`p-6 rounded-lg text-left border-l-4 ${feedback.correct ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                  <h4 className={`text-[10px] font-black uppercase tracking-widest mb-2 ${feedback.correct ? 'text-green-600' : 'text-red-600'}`}>
                    {feedback.correct ? 'NATIJA: TO\'G\'RI' : 'NATIJA: NOTO\'G\'RI'}
                  </h4>
                  <p className="text-slate-800 text-sm leading-relaxed font-medium">{feedback.explanation}</p>
                  
                  {feedback.correct_sentence && (
                    <div className="mt-4 pt-4 border-t border-slate-200/50">
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">NAMUNA / TO'G'RI JAVOB:</div>
                      <p className="text-slate-900 font-bold text-base leading-snug">{feedback.correct_sentence}</p>
                    </div>
                  )}
                </div>

                <button
                  onClick={nextRound}
                  className="w-full py-5 bg-slate-900 text-white rounded-lg font-black text-xs tracking-[0.2em] hover:bg-slate-800 active:scale-[0.98] transition-all shadow-xl shadow-slate-200 uppercase"
                >
                  KEYINGI SO'Z
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Game;
