
import React, { useState, useEffect } from 'react';
import { Flashcard, SupportedLanguage } from '../types';
import { evaluateAnswer } from '../services/vocabService';

interface StudySessionProps {
  cards: Flashcard[];
  onExit: () => void;
  language: SupportedLanguage;
}

type Mode = 'MENU' | 'STUDY' | 'TEST_TRANSLATION' | 'TEST_SENTENCE';
type CardSide = 'FRONT' | 'BACK';
type TestState = 'INPUT' | 'EVALUATING' | 'RESULT';

const StudySession: React.FC<StudySessionProps> = ({ cards, onExit, language }) => {
  const [mode, setMode] = useState<Mode>('MENU');
  
  // Study State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [studySide, setStudySide] = useState<CardSide>('FRONT');

  // Test State
  const [userAnswer, setUserAnswer] = useState('');
  const [testState, setTestState] = useState<TestState>('INPUT');
  const [evaluation, setEvaluation] = useState<{ correct: boolean; feedback: string } | null>(null);
  
  // Audio playing state
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const currentCard = cards[currentIndex];

  useEffect(() => {
    // Reset states when card changes
    setStudySide('FRONT');
    setTestState('INPUT');
    setUserAnswer('');
    setEvaluation(null);
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

  // --- AUDIO LOGIC ---
  const playAudio = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    if (currentCard.audio) {
      setIsPlayingAudio(true);
      const audio = new Audio(currentCard.audio);
      audio.play().catch(err => console.error("Audio play failed", err));
      audio.onended = () => setIsPlayingAudio(false);
    }
  };

  // --- STUDY MODE LOGIC ---
  const toggleStudySide = () => {
    setStudySide(prev => prev === 'FRONT' ? 'BACK' : 'FRONT');
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
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-sm shrink-0">
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
      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-2xl">
          
          {/* STUDY MODE CARD */}
          {mode === 'STUDY' && (
            <div 
              onClick={toggleStudySide}
              className="bg-white rounded-2xl shadow-xl border border-gray-200 min-h-[400px] flex flex-col items-center justify-center text-center p-10 cursor-pointer hover:border-indigo-400 transition-all select-none relative"
            >
              {studySide === 'FRONT' ? (
                <div className="animate-in fade-in zoom-in-95 duration-300 flex flex-col items-center">
                  <h1 className="text-5xl md:text-7xl font-black text-slate-900 mb-4 tracking-tighter break-all">{currentCard.word}</h1>
                  
                  {/* IPA & Audio Section */}
                  <div className="flex items-center gap-3 mb-6">
                    <p className="text-xl md:text-2xl font-ipa text-slate-400">
                        {currentCard.ipa ? (language === 'zh' ? `[${currentCard.ipa}]` : currentCard.ipa) : ''}
                    </p>
                    {currentCard.audio && (
                      <button 
                        onClick={playAudio}
                        className={`p-2 rounded-full transition-all ${isPlayingAudio ? 'bg-indigo-100 text-indigo-600 scale-110' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                      >
                         <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                      </button>
                    )}
                  </div>

                  <p className="mt-8 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Tap to Flip</p>
                </div>
              ) : (
                <div className="animate-in fade-in zoom-in-95 duration-300 w-full">
                  <h2 className="text-3xl md:text-4xl font-black text-indigo-600 mb-6">{currentCard.translation}</h2>
                  <div className="w-16 h-1 bg-gray-100 mx-auto mb-6 rounded-full" />
                  <p className="text-lg text-slate-700 leading-relaxed mb-8 font-medium font-ipa">{currentCard.definition}</p>
                  <div className="bg-slate-50 p-6 rounded-xl border border-slate-100">
                    <p className="text-lg italic text-slate-500 font-ipa">"{currentCard.example}"</p>
                  </div>
                  <p className="mt-8 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">Tap to Flip Back</p>
                </div>
              )}
            </div>
          )}

          {/* TEST MODE CARD */}
          {(mode === 'TEST_TRANSLATION' || mode === 'TEST_SENTENCE') && (
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 min-h-[400px] flex flex-col p-8 md:p-12">
              
              <div className="text-center mb-8">
                <span className="inline-block px-3 py-1 bg-slate-100 text-slate-500 rounded text-[10px] font-black uppercase tracking-widest mb-4">
                  {mode === 'TEST_TRANSLATION' ? 'Translate to Uzbek' : 'Write a sentence'}
                </span>
                <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-2 font-ipa">{currentCard.word}</h1>
                <p className="text-lg font-ipa text-slate-400">{currentCard.ipa}</p>
              </div>

              {testState !== 'RESULT' ? (
                <div className="w-full max-w-lg mx-auto flex-1 flex flex-col">
                  <textarea
                    className="w-full p-4 text-lg border-2 border-slate-200 rounded-xl focus:border-indigo-600 focus:ring-0 outline-none transition-all resize-none mb-4"
                    rows={3}
                    placeholder={mode === 'TEST_TRANSLATION' ? "Type translation in Uzbek..." : `Write a ${language === 'en' ? 'English' : language === 'es' ? 'Spanish' : 'Chinese'} sentence...`}
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    disabled={testState === 'EVALUATING'}
                  />
                  <button
                    onClick={submitAnswer}
                    disabled={!userAnswer.trim() || testState === 'EVALUATING'}
                    className={`w-full py-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all ${
                      testState === 'EVALUATING' 
                        ? 'bg-slate-100 text-slate-400' 
                        : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-200'
                    }`}
                  >
                    {testState === 'EVALUATING' ? 'AI Analyzing...' : 'Check Answer'}
                  </button>
                </div>
              ) : (
                <div className="w-full max-w-lg mx-auto animate-in slide-in-from-bottom-4 fade-in duration-500">
                  <div className={`p-6 rounded-xl border mb-6 ${evaluation?.correct ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-full ${evaluation?.correct ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                        {evaluation?.correct ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                        )}
                      </div>
                      <h3 className={`text-lg font-black ${evaluation?.correct ? 'text-emerald-900' : 'text-rose-900'}`}>
                        {evaluation?.correct ? 'Excellent!' : 'Needs Improvement'}
                      </h3>
                    </div>
                    <p className={`text-sm leading-relaxed ${evaluation?.correct ? 'text-emerald-800' : 'text-rose-800'}`}>
                      {evaluation?.feedback}
                    </p>
                  </div>
                  
                  {/* Reference Answer Display */}
                  <div className="mb-8 p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Correct Meaning</p>
                    <p className="text-slate-800 font-medium">{currentCard.translation}</p>
                    {mode === 'TEST_SENTENCE' && (
                       <p className="text-sm text-slate-500 italic mt-2 font-ipa">Ex: "{currentCard.example}"</p>
                    )}
                  </div>

                  <button
                    onClick={handleNext}
                    className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg"
                  >
                    {currentIndex < cards.length - 1 ? 'Next Question' : 'Finish Test'}
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* FOOTER CONTROLS (Only for Study Mode) */}
      {mode === 'STUDY' && (
        <div className="bg-white border-t border-gray-200 p-6 shrink-0">
          <div className="max-w-2xl mx-auto flex justify-between gap-4">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className={`flex-1 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                currentIndex === 0 
                ? 'bg-gray-50 text-gray-300 cursor-not-allowed' 
                : 'bg-white border border-gray-200 text-slate-900 hover:border-slate-900 hover:shadow-md'
              }`}
            >
              Previous
            </button>
            <button
              onClick={handleNext}
              disabled={currentIndex === cards.length - 1}
              className={`flex-1 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                currentIndex === cards.length - 1
                ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                : 'bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-200'
              }`}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudySession;
