
import React, { useState, useEffect } from 'react';
import { Flashcard, SupportedLanguage } from '../../types';
import { evaluateAnswer } from '../../services/vocabService';

interface StudySessionProps {
  cards: Flashcard[];
  onExit: () => void;
  language: SupportedLanguage;
  onToggleMistake: (cardId: string) => void;
}

type Mode = 'MENU' | 'STUDY' | 'TEST_TRANSLATION' | 'TEST_SENTENCE';
type CardSide = 'FRONT' | 'BACK';
type TestState = 'INPUT' | 'EVALUATING' | 'RESULT';

const StudySession: React.FC<StudySessionProps> = ({ cards, onExit, language, onToggleMistake }) => {
  const [mode, setMode] = useState<Mode>('MENU');

  // Study State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false); // For 3D animation

  // Test State
  const [userAnswer, setUserAnswer] = useState('');
  const [testState, setTestState] = useState<TestState>('INPUT');
  const [evaluation, setEvaluation] = useState<{ correct: boolean; feedback: string } | null>(null);

  // Audio playing state
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const currentCard = cards[currentIndex];

  useEffect(() => {
    // Reset states when card changes
    setIsFlipped(false);
    setTestState('INPUT');
    setUserAnswer('');
    setEvaluation(null);
    setIsPlayingAudio(false);

    // Stop any ongoing speech when switching cards
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, [currentIndex, mode]);

  const handleNext = () => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  // --- AUDIO LOGIC (HYBRID APPROACH) ---
  const playAudio = (e: React.MouseEvent) => {
    e.stopPropagation();

    // 1. Priority: Play Static MP3 if available (English Dictionary)
    if (currentCard.audio) {
      setIsPlayingAudio(true);
      const audio = new Audio(currentCard.audio);
      audio.play().catch(err => {
        console.error("MP3 Audio play failed", err);
        setIsPlayingAudio(false);
      });
      audio.onended = () => setIsPlayingAudio(false);
      return;
    }

    // 2. Fallback: Use Device's Native Text-to-Speech (Spanish/Chinese/Offline)
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(currentCard.word);
      switch (language) {
        case 'es': utterance.lang = 'es-ES'; break;
        case 'zh': utterance.lang = 'zh-CN'; break;
        default: utterance.lang = 'en-US';
      }
      utterance.rate = 0.9;
      utterance.onstart = () => setIsPlayingAudio(true);
      utterance.onend = () => setIsPlayingAudio(false);
      utterance.onerror = (e) => {
        console.error("Speech synthesis error", e);
        setIsPlayingAudio(false);
      };
      window.speechSynthesis.speak(utterance);
    } else {
      alert("Audio not supported on this device.");
    }
  };

  // --- STUDY MODE LOGIC ---
  const toggleFlip = () => {
    setIsFlipped(prev => !prev);
  };

  // --- TEST MODE LOGIC ---
  const submitAnswer = async () => {
    if (!userAnswer.trim()) return;

    setTestState('EVALUATING');

    try {
      const isTranslation = mode === 'TEST_TRANSLATION';
      const context = isTranslation ? currentCard.translation : currentCard.definition;

      const result = await evaluateAnswer(
        currentCard.word,
        context,
        userAnswer,
        isTranslation ? 'TRANSLATION' : 'SENTENCE',
        language
      );

      setEvaluation(result);
      setTestState('RESULT');
    } catch (e) {
      setEvaluation({ correct: false, feedback: "Connection error. Please try again." });
      setTestState('RESULT');
    }
  };

  // --- RENDERERS ---

  if (mode === 'MENU') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900 text-white flex flex-col items-center justify-center p-6">
        <h2 className="text-3xl font-black tracking-tighter mb-2">CHOOSE MODE</h2>
        <div className="text-xs font-bold uppercase tracking-widest bg-slate-800 px-3 py-1 rounded mb-8 text-indigo-400">
          Language: {language === 'en' ? 'English' : language === 'es' ? 'Spanish' : 'Chinese'}
        </div>

        <div className="grid gap-4 w-full max-w-md">
          <button
            onClick={() => setMode('STUDY')}
            className="bg-indigo-600 hover:bg-indigo-500 p-6 rounded-xl text-left transition-all group"
          >
            <h3 className="text-xl font-bold mb-1 group-hover:translate-x-1 transition-transform">Study Mode</h3>
            <p className="text-indigo-200 text-sm">Review cards. Flip Front/Back.</p>
          </button>

          <button
            onClick={() => setMode('TEST_TRANSLATION')}
            className="bg-emerald-700 hover:bg-emerald-600 p-6 rounded-xl text-left transition-all group"
          >
            <h3 className="text-xl font-bold mb-1 group-hover:translate-x-1 transition-transform">Translation Test</h3>
            <p className="text-emerald-200 text-sm">Type the meaning in Uzbek.</p>
          </button>

          <button
            onClick={() => setMode('TEST_SENTENCE')}
            className="bg-rose-700 hover:bg-rose-600 p-6 rounded-xl text-left transition-all group"
          >
            <h3 className="text-xl font-bold mb-1 group-hover:translate-x-1 transition-transform">Sentence Builder</h3>
            <p className="text-rose-200 text-sm">Write a sentence using the word.</p>
          </button>

          <button
            onClick={onExit}
            className="mt-4 py-4 text-slate-500 hover:text-white font-bold text-xs uppercase tracking-widest"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col h-screen w-screen font-sans text-slate-900">
      {/* HEADER */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-sm shrink-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => setMode('MENU')} className="text-slate-400 hover:text-slate-900">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </button>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-900">
              {mode === 'STUDY' ? 'Study' : mode === 'TEST_TRANSLATION' ? 'Translation' : 'Sentences'}
            </h2>
            <p className="text-[10px] font-bold text-slate-400">
              Card {currentIndex + 1} / {cards.length} ({language.toUpperCase()})
            </p>
          </div>
        </div>
        <div className="w-24 bg-gray-100 h-1 rounded-full overflow-hidden">
          <div
            className="bg-indigo-600 h-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
          />
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-hidden relative perspective-1000" style={{ perspective: '1000px' }}>
        <div className="w-full max-w-xl h-[450px] relative">

          {/* STUDY MODE CARD (WITH 3D FLIP) */}
          {mode === 'STUDY' && (
            <div
              onClick={toggleFlip}
              className="w-full h-full relative cursor-pointer"
              style={{
                transformStyle: 'preserve-3d',
                transition: 'transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
              }}
            >
              {/* FRONT SIDE */}
              <div
                className="absolute inset-0 bg-white rounded-3xl shadow-2xl border-2 border-slate-100 flex flex-col items-center justify-center p-8 backface-hidden"
                style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
              >
                {currentCard.isMistake && (
                  <div className="absolute top-6 right-6 bg-red-100 text-red-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                    Mistake
                  </div>
                )}

                <div className="flex-1 flex flex-col items-center justify-center w-full">
                  <h1 className="text-5xl md:text-6xl font-black text-slate-900 mb-6 text-center break-words leading-tight">{currentCard.word}</h1>

                  {/* IPA & Audio Section */}
                  <div className="flex items-center gap-4 mb-8 bg-slate-50 px-6 py-3 rounded-full">
                    <p className="text-xl font-ipa text-slate-500">
                      {currentCard.ipa ? (language === 'zh' ? `[${currentCard.ipa}]` : currentCard.ipa) : ''}
                    </p>
                    <button
                      onClick={playAudio}
                      className={`p-2 rounded-full transition-all ${isPlayingAudio ? 'bg-indigo-100 text-indigo-600 scale-110' : 'text-slate-400 hover:text-indigo-600'}`}
                    >
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                    </button>
                  </div>
                </div>

                <div className="mt-auto">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">Tap to Flip</p>
                </div>
              </div>

              {/* BACK SIDE */}
              <div
                className="absolute inset-0 bg-slate-900 rounded-3xl shadow-2xl flex flex-col items-center justify-center p-8 backface-hidden"
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)'
                }}
              >
                <div className="flex-1 flex flex-col items-center justify-center w-full text-center">
                  <h2 className="text-3xl md:text-4xl font-black text-indigo-400 mb-6">{currentCard.translation}</h2>
                  <div className="w-12 h-1 bg-slate-700 rounded-full mb-6"></div>
                  <p className="text-lg text-slate-300 leading-relaxed mb-8 font-medium max-w-sm">{currentCard.definition}</p>
                  <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 w-full max-w-sm">
                    <p className="text-base italic text-slate-400">"{currentCard.example}"</p>
                  </div>
                </div>
                <div className="mt-auto">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Tap to Flip Back</p>
                </div>
              </div>
            </div>
          )}

          {/* TEST MODES (No Flip) */}
          {(mode === 'TEST_TRANSLATION' || mode === 'TEST_SENTENCE') && (
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 h-full flex flex-col p-8 md:p-10 relative overflow-y-auto">
              {/* Same test UI as before, just kept clean */}
              <div className="text-center mb-6">
                <span className="inline-block px-3 py-1 bg-slate-100 text-slate-500 rounded text-[10px] font-black uppercase tracking-widest mb-4">
                  {mode === 'TEST_TRANSLATION' ? 'Translate to Uzbek' : 'Write a sentence'}
                </span>
                <h1 className="text-3xl font-black text-slate-900 mb-2">{currentCard.word}</h1>
              </div>

              {testState !== 'RESULT' ? (
                <div className="flex-1 flex flex-col">
                  <textarea
                    className="w-full p-4 border-2 border-slate-200 rounded-xl focus:border-indigo-600 focus:ring-0 outline-none transition-all resize-none mb-4 flex-1 text-lg"
                    placeholder={mode === 'TEST_TRANSLATION' ? "Type translation..." : "Write a sentence..."}
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    disabled={testState === 'EVALUATING'}
                  />
                  <button
                    onClick={submitAnswer}
                    disabled={!userAnswer.trim() || testState === 'EVALUATING'}
                    className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-widest ${testState === 'EVALUATING' ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
                  >
                    {testState === 'EVALUATING' ? 'Behavor...' : 'Check Answer'}
                  </button>
                </div>
              ) : (
                <div className="flex-1 flex flex-col animate-in fade-in">
                  <div className={`p-4 rounded-xl border mb-4 flex-1 ${evaluation?.correct ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                    <h3 className={`font-black mb-2 ${evaluation?.correct ? 'text-emerald-700' : 'text-rose-700'}`}>{evaluation?.correct ? 'Correct!' : 'Incorrect'}</h3>
                    <p className="text-sm text-slate-700">{evaluation?.feedback}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded mb-4">
                    <p className="text-xs font-bold text-slate-400 uppercase">Answer</p>
                    <p className="font-medium text-slate-800">{currentCard.translation}</p>
                  </div>
                  <button onClick={handleNext} className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest">Next</button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* FOOTER CONTROLS */}
      {mode === 'STUDY' && (
        <div className="bg-white border-t border-gray-200 p-4 md:p-6 shrink-0 z-20">
          <div className="max-w-xl mx-auto flex items-center gap-4">
            {/* MISTAKE TOGGLE BUTTON */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleMistake(currentCard.id);
              }}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-lg active:scale-95 ${currentCard.isMistake
                  ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200 border-2 border-emerald-300'
                  : 'bg-rose-50 text-rose-400 hover:bg-rose-100 border-2 border-transparent hover:border-rose-200'
                }`}
              title={currentCard.isMistake ? "Mark as Mastered (Remove from Mistakes)" : "Mark as Mistake"}
            >
              {currentCard.isMistake ? (
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              ) : (
                <span className="text-2xl font-black">?</span>
              )}
            </button>

            {/* NAVIGATION */}
            <div className="flex-1 flex gap-3">
              <button
                onClick={handlePrev}
                disabled={currentIndex === 0}
                className={`flex-1 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${currentIndex === 0
                  ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                  : 'bg-white border-2 border-gray-100 text-slate-900 hover:border-slate-300'
                  }`}
              >
                Prev
              </button>
              <button
                onClick={handleNext}
                disabled={currentIndex === cards.length - 1}
                className={`flex-1 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${currentIndex === cards.length - 1
                  ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                  : 'bg-slate-900 text-white hover:bg-slate-800 shadow-xl shadow-slate-200'
                  }`}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudySession;
