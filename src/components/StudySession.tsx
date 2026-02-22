
import React, { useState, useEffect } from 'react';
import { Flashcard, SupportedLanguage } from '../../types';
import { evaluateAnswer } from '../../services/vocabService';

interface StudySessionProps {
  cards: Flashcard[];
  onExit: () => void;
  language: SupportedLanguage;
  onToggleMistake: (cardId: string) => void;
  onDeleteCard: (cardId: string) => Promise<void>;
}

type Mode = 'MENU' | 'STUDY' | 'TEST_TRANSLATION' | 'TEST_SENTENCE';
type CardSide = 'FRONT' | 'BACK';
type TestState = 'INPUT' | 'EVALUATING' | 'RESULT';

const StudySession: React.FC<StudySessionProps> = ({ cards, onExit, language, onToggleMistake, onDeleteCard }) => {
  const isDark = document.body.classList.contains('dark');
  const [mode, setMode] = useState<Mode>('MENU');

  // Study State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false); // For 3D animation
  const [jumpInput, setJumpInput] = useState('1'); // Jump Input State

  // Test State
  const [userAnswer, setUserAnswer] = useState('');
  const [testState, setTestState] = useState<TestState>('INPUT');
  const [evaluation, setEvaluation] = useState<{ correct: boolean; feedback: string } | null>(null);

  // Audio playing state
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Sync Jump Input with Current Index
  useEffect(() => {
    setJumpInput((currentIndex + 1).toString());
  }, [currentIndex]);

  // Safety check for index
  useEffect(() => {
    if (currentIndex >= cards.length && cards.length > 0) {
      setCurrentIndex(Math.max(0, cards.length - 1));
    }
  }, [cards.length, currentIndex]);

  const currentCard = cards[currentIndex];

  const handleJump = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      let page = parseInt(jumpInput);
      if (isNaN(page)) page = 1;
      // Clamp value
      page = Math.max(1, Math.min(page, cards.length));
      setCurrentIndex(page - 1);
      e.currentTarget.blur();
    }
  };

  const handleBlur = () => {
    setJumpInput((currentIndex + 1).toString());
  };

  const handleDeleteCurrent = async () => {
    if (window.confirm("Bu so'zni o'chirib tashlashga ishonchingiz komilmi?")) {
      await onDeleteCard(currentCard.id);
      // Index adjustment is handled by the useEffect above
    }
  };


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
  }, [currentCard?.id, mode]); // Use ID instead of index to avoid flicker on list change

  // --- PC KEYBOARD SHORTCUTS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Input/textarea da yozayotganda ishlamasin
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      // Study va Test rejimlarida ishlaydi
      if (mode === 'MENU') return;

      switch (e.key) {
        case 'ArrowRight':
        case '.': // > tugmasi (Shift + .)
        case '>':
          e.preventDefault();
          handleNext();
          break;
        case 'ArrowLeft':
        case ',': // < tugmasi (Shift + ,)
        case '<':
          e.preventDefault();
          handlePrev();
          break;
        case 'ArrowDown':
        case 'ArrowUp':
          if (mode === 'STUDY') {
            e.preventDefault();
            toggleFlip();
          }
          break;
        case '0':
          if (mode === 'STUDY') {
            e.preventDefault();
            playAudio({ stopPropagation: () => { } } as React.MouseEvent);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, currentIndex, cards.length]);

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
      <div className={`fixed inset-0 z-50 text-white flex flex-col items-center justify-center p-6 ${isDark ? 'bg-slate-950' : 'bg-slate-900'}`}>
        <h2 className="text-3xl font-black tracking-tighter mb-2">CHOOSE MODE</h2>
        <div className={`text-xs font-bold uppercase tracking-widest px-3 py-1 rounded mb-8 text-indigo-400 ${isDark ? 'bg-slate-900' : 'bg-slate-800'}`}>
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

  // Check for empty state BEFORE rendering main UI
  if (cards.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900 text-white flex flex-col items-center justify-center p-6 animate-in fade-in">
        <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-2xl shadow-emerald-900/50">
          <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
        </div>
        <h2 className="text-3xl font-black mb-2 text-center">All Caught Up!</h2>
        <p className="text-slate-400 mb-8 text-center max-w-xs">No more cards in this list. Great job!</p>
        <button onClick={onExit} className="bg-white text-slate-900 px-8 py-3 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-transform">
          Back to Dashboard
        </button>
      </div>
    );
  }


  return (
    <div className={`fixed inset-0 z-50 flex flex-col h-screen w-screen font-sans transition-colors duration-300 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-gray-50 text-slate-900'}`}>
      {/* HEADER */}
      <div className={`px-6 py-4 flex justify-between items-center shadow-sm shrink-0 z-10 border-b transition-colors duration-300 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center gap-4">
          <button onClick={onExit} className={`${isDark ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900'}`}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </button>
          <div>
            <h2 className={`text-sm font-black uppercase tracking-widest ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {mode === 'STUDY' ? 'Study' : mode === 'TEST_TRANSLATION' ? 'Translation' : 'Sentences'}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Card</span>
              <input
                type="number"
                className={`w-12 h-6 text-center text-[10px] font-bold rounded border focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all ${isDark ? 'text-slate-300 bg-slate-800 border-slate-700' : 'text-slate-600 bg-gray-100 border-gray-200'}`}
                value={jumpInput}
                onChange={(e) => setJumpInput(e.target.value)}
                onKeyDown={handleJump}
                onBlur={handleBlur}
                min={1}
                max={cards.length}
              />
              <span className={`text-[10px] font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>/ {cards.length} ({language.toUpperCase()})</span>
            </div>
          </div>
        </div>
        <div className={`w-24 h-1 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-gray-100'}`}>
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
              {/* DELETE BUTTON (Absolute, outside flipping face but inside 3D container? No, needs to be on the FRONT face or floating above) */}
              {/* If we put it here, it rotates with the card. If we want it always visible, it should be outside the 3D wrapper. 
                  But user said "top-right corner of the flashcard container". 
                  Let's put it on the FRONT face for now, as deleting usually happens when looking at the word. 
                  Actually, user might want to delete after seeing the back.
                  Let's check the user requirement: "top-right corner of the flashcard container". 
                  Best to float it? Use a separate z-index layer independent of rotation? 
                  If I put it outside the `div` with `rotateY`, it won't rotate. 
                  Let's try putting it inside the `relative` wrapper but outside the `rotate` div?
                  Refactoring the structure slightly to support a non-rotating button would be safer.
                  BUT, simpler implementation: Put it on the FRONT face.
              */}

              {/* FRONT SIDE */}
              <div
                className="absolute inset-0 bg-white rounded-3xl shadow-2xl border-2 border-slate-100 flex flex-col items-center justify-center p-8 backface-hidden"
                style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
              >
                {/* DELETE BUTTON - Top Right */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCurrent();
                  }}
                  className="absolute top-5 right-5 z-20 w-8 h-8 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                  title="Delete Card"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                {currentCard.isMistake && (
                  <div className="absolute top-6 left-6 bg-red-100 text-red-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
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
                <div className="flex-1 flex flex-col items-center justify-center w-full text-center px-4">
                  {/* ZEALOUS STYLE: Balanced Typography */}
                  <h2 className="text-2xl md:text-3xl font-black text-purple-600 mb-2 drop-shadow-xl tracking-tight">
                    {currentCard.translation.split('\n')[0].replace(/<[^>]*>?/gm, '').replace(/Audio:.*$/i, '').trim()}
                  </h2>

                  <div className="w-20 h-1 bg-purple-100/20 rounded-full mb-10"></div>

                  {/* CLEAN DEFINITION (Plain white text, text-base) */}
                  <div className="max-w-md">
                    <p className="text-base text-white leading-relaxed font-bold">
                      {currentCard.definition.replace(/<[^>]*>?/gm, '').replace(/Audio:.*$/i, '').trim()}
                    </p>
                  </div>

                  {/* EXAMPLE BOX (Styled & Separated) */}
                  {currentCard.example && (
                    <div className="mt-12 bg-white/10 border border-white/20 backdrop-blur-sm p-6 rounded-2xl w-full max-w-lg shadow-2xl">
                      <p className="text-purple-200 font-bold italic text-md leading-relaxed">
                        "{currentCard.example.replace(/^Example:\s*/i, '').replace(/<[^>]*>?/gm, '').trim()}"
                      </p>
                    </div>
                  )}
                </div>
                <div className="mt-auto">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Tap to Flip Back</p>
                </div>
              </div>
            </div>
          )}

          {/* TEST MODES (No Flip) */}
          {(mode === 'TEST_TRANSLATION' || mode === 'TEST_SENTENCE') && (
            <div className={`rounded-2xl shadow-xl border h-full flex flex-col p-8 md:p-10 relative overflow-y-auto ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
              {/* Same test UI as before, just kept clean */}
              <div className="text-center mb-6">
                <span className={`inline-block px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest mb-4 ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                  {mode === 'TEST_TRANSLATION' ? 'Translate to Uzbek' : 'Write a sentence'}
                </span>
                <h1 className={`text-3xl font-black mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>{currentCard.word}</h1>
              </div>

              {testState !== 'RESULT' ? (
                <div className="flex-1 flex flex-col">
                  <textarea
                    className={`w-full p-4 border-2 rounded-xl focus:border-indigo-600 focus:ring-0 outline-none transition-all resize-none mb-4 flex-1 text-lg ${isDark ? 'bg-slate-700 border-slate-600 text-white placeholder:text-slate-500' : 'border-slate-200 text-slate-900'}`}
                    placeholder={mode === 'TEST_TRANSLATION' ? "Type translation..." : "Write a sentence..."}
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    disabled={testState === 'EVALUATING'}
                  />
                  <button
                    onClick={submitAnswer}
                    disabled={!userAnswer.trim() || testState === 'EVALUATING'}
                    className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-widest ${testState === 'EVALUATING' ? (isDark ? 'bg-slate-700 text-slate-500' : 'bg-slate-100 text-slate-400') : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
                  >
                    {testState === 'EVALUATING' ? 'Behavor...' : 'Check Answer'}
                  </button>
                </div>
              ) : (
                <div className="flex-1 flex flex-col animate-in fade-in">
                  <div className={`p-4 rounded-xl border mb-4 flex-1 ${evaluation?.correct ? (isDark ? 'bg-emerald-900/30 border-emerald-700' : 'bg-emerald-50 border-emerald-200') : (isDark ? 'bg-rose-900/30 border-rose-700' : 'bg-rose-50 border-rose-200')}`}>
                    <h3 className={`font-black mb-2 ${evaluation?.correct ? 'text-emerald-500' : 'text-rose-500'}`}>{evaluation?.correct ? 'Correct!' : 'Incorrect'}</h3>
                    <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{evaluation?.feedback}</p>
                  </div>
                  <div className={`p-3 rounded mb-4 ${isDark ? 'bg-slate-700' : 'bg-slate-50'}`}>
                    <p className={`text-xs font-bold uppercase ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Answer</p>
                    <p className={`font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{currentCard.translation}</p>
                  </div>
                  <button onClick={handleNext} className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-widest ${isDark ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-slate-900 text-white'}`}>Next</button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* FOOTER CONTROLS */}
      {
        mode === 'STUDY' && (
          <div className={`border-t p-4 md:p-6 shrink-0 z-20 transition-colors duration-300 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
            <div className="max-w-xl mx-auto flex items-center gap-4">
              {/* MISTAKE TOGGLE BUTTON */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMistake(currentCard.id);
                }}
                className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-lg active:scale-95 ${currentCard.isMistake
                  ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200 border-2 border-emerald-300'
                  : (isDark ? 'bg-rose-900/30 text-rose-400 hover:bg-rose-900/50 border-2 border-transparent hover:border-rose-700' : 'bg-rose-50 text-rose-400 hover:bg-rose-100 border-2 border-transparent hover:border-rose-200')
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
                    ? (isDark ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-gray-50 text-gray-300 cursor-not-allowed')
                    : (isDark ? 'bg-slate-800 border-2 border-slate-700 text-white hover:border-slate-500' : 'bg-white border-2 border-gray-100 text-slate-900 hover:border-slate-300')
                    }`}
                >
                  Prev
                </button>
                <button
                  onClick={handleNext}
                  disabled={currentIndex === cards.length - 1}
                  className={`flex-1 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${currentIndex === cards.length - 1
                    ? (isDark ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-gray-50 text-gray-300 cursor-not-allowed')
                    : (isDark ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-xl shadow-indigo-900/30' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-xl shadow-slate-200')
                    }`}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default StudySession;
