
import React, { useState, useEffect, useRef } from 'react';
import { Word, GameMode } from './types';
import { extractWords } from './services/proAiService';
import WordList from './components/WordList';
import Game from './components/Game';

const STORAGE_WORDS_KEY = 'vocab_v2_words';
const STORAGE_SENTENCES_KEY = 'vocab_v2_sentences';

const App: React.FC = () => {
  const [words, setWords] = useState<Word[]>([]);
  const [sentenceCache, setSentenceCache] = useState<Record<string, any>>({});
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<GameMode | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const savedWords = localStorage.getItem(STORAGE_WORDS_KEY);
    const savedSentences = localStorage.getItem(STORAGE_SENTENCES_KEY);
    if (savedWords) setWords(JSON.parse(savedWords));
    if (savedSentences) setSentenceCache(JSON.parse(savedSentences));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_WORDS_KEY, JSON.stringify(words));
  }, [words]);

  useEffect(() => {
    localStorage.setItem(STORAGE_SENTENCES_KEY, JSON.stringify(sentenceCache));
  }, [sentenceCache]);

  const handleAddWords = async () => {
    const rawInput = input.trim();
    if (!rawInput) return;

    const inputWords = rawInput.split(',').map(w => w.trim()).filter(w => w.length > 0);
    const uniqueInputs: string[] = Array.from(new Set(inputWords));
    
    const newToTranslate = uniqueInputs.filter(
      inputWord => !words.some(w => w.english.toLowerCase() === inputWord.toLowerCase())
    );

    if (newToTranslate.length === 0) {
      alert("Barcha so'zlar allaqachon mavjud.");
      setInput('');
      return;
    }

    setIsLoading(true);
    try {
      const results = await extractWords(newToTranslate.join(', '));
      
      const newEntries: Word[] = results.map(res => ({
        id: Math.random().toString(36).substring(2, 11),
        english: res.word,
        uzbek: res.translation,
        type: res.type,
        createdAt: Date.now(),
        stats: { timesAsked: 0, correctCount: 0, lastResult: null }
      }));

      setWords(prev => [...newEntries, ...prev]);
      setInput('');
      inputRef.current?.focus();
    } catch (error) {
      alert("Pro AI xatoligi: " + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const updateWordStats = (wordId: string, isCorrect: boolean) => {
    setWords(prev => prev.map(w => {
      if (w.id === wordId) {
        return {
          ...w,
          stats: {
            timesAsked: w.stats.timesAsked + 1,
            correctCount: isCorrect ? w.stats.correctCount + 1 : w.stats.correctCount,
            lastResult: isCorrect ? 'correct' : 'incorrect'
          }
        };
      }
      return w;
    }));
  };

  const cacheSentenceFeedback = (word: string, sentence: string, feedback: any) => {
    const key = `${word.toLowerCase()}:${sentence.toLowerCase().trim()}`;
    setSentenceCache(prev => ({ ...prev, [key]: feedback }));
  };

  const deleteWord = (id: string) => {
    if (confirm("Ushbu so'zni o'chirmoqchimisiz?")) {
      setWords(prev => prev.filter(w => w.id !== id));
    }
  };

  const resetStats = () => {
    if (confirm("Statistikani nolga tushirasizmi? So'zlar o'chirilmaydi.")) {
      setWords(prev => prev.map(w => ({
        ...w,
        stats: { timesAsked: 0, correctCount: 0, lastResult: null }
      })));
    }
  };

  return (
    <div className="min-h-screen bg-white md:bg-gray-50 flex flex-col font-sans antialiased text-slate-900">
      <header className="bg-white border-b border-gray-200 py-4 px-4 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl font-black tracking-tighter">INGLIZ TILI PRO</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-0.5">Pro AI Tizimi</p>
          </div>
          {words.length > 0 && !mode && (
            <button 
              onClick={resetStats}
              className="text-[10px] text-slate-400 hover:text-red-600 font-black uppercase tracking-widest transition-colors"
            >
              Tozalash
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 md:py-12">
        {!mode ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-5 space-y-8">
              <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-4 tracking-[0.15em]">
                  Yangi so'zlar (Pro AI)
                </label>
                <textarea
                  ref={inputRef}
                  className="w-full p-4 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 focus:border-slate-900 outline-none transition-all h-28 text-lg placeholder:text-slate-200 font-medium"
                  placeholder="Masalan: learn, efficient, logic"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && e.ctrlKey && handleAddWords()}
                  disabled={isLoading}
                />
                <button
                  onClick={handleAddWords}
                  disabled={isLoading || !input.trim()}
                  className={`w-full mt-4 py-4 rounded-lg font-black text-xs tracking-[0.2em] transition-all uppercase shadow-md ${
                    isLoading 
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none' 
                      : 'bg-slate-900 text-white hover:bg-slate-800 active:scale-95 shadow-slate-200'
                  }`}
                >
                  {isLoading ? 'Yuklanmoqda...' : 'Saqlash'}
                </button>
              </section>

              {words.length > 0 && (
                <section className="grid grid-cols-1 gap-4">
                  <button
                    onClick={() => setMode(GameMode.TRANSLATION)}
                    className="group p-6 bg-white border border-slate-200 rounded-xl text-left hover:border-slate-900 transition-all active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rejim 01</div>
                      <div className="w-2 h-2 rounded-full bg-slate-900"></div>
                    </div>
                    <h3 className="font-black text-xl text-slate-900">Tarjima O'yini</h3>
                  </button>
                  <button
                    onClick={() => setMode(GameMode.SENTENCE_BUILDING)}
                    className="group p-6 bg-white border border-slate-200 rounded-xl text-left hover:border-slate-900 transition-all active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rejim 02</div>
                      <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                    </div>
                    <h3 className="font-black text-xl text-slate-900">Gap Tuzish (Pro AI)</h3>
                  </button>
                </section>
              )}
            </div>

            <div className="lg:col-span-7">
              {words.length > 0 ? (
                <WordList words={words} onDelete={deleteWord} />
              ) : (
                <div className="h-full flex items-center justify-center py-20 border-2 border-dashed border-slate-100 rounded-2xl">
                  <p className="text-slate-300 font-black uppercase tracking-widest text-[10px]">Ma'lumotlar yo'q</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <Game 
            words={words} 
            mode={mode} 
            sentenceCache={sentenceCache}
            onExit={() => setMode(null)} 
            onUpdateStats={updateWordStats}
            onCacheSentence={cacheSentenceFeedback}
          />
        )}
      </main>

      <footer className="py-8 text-center border-t border-slate-50 bg-white">
        <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.4em]">
          PRO AI &bull; CUSTOM API KEY ACTIVE
        </p>
      </footer>
    </div>
  );
};

export default App;
