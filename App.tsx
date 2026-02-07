
import React, { useState, useEffect } from 'react';
import { Flashcard } from './types';
import { extractWords } from './services/vocabService';
import { generatePDF } from './services/pdfGenerator';
import StudySession from './components/StudySession';
import InstallBanner from './components/InstallBanner';

const STORAGE_KEY = 'vocab_pro_flashcards_v1';

const App: React.FC = () => {
  // Lazy initialize state from localStorage to prevent overwriting with empty array on initial render
  const [flashcards, setFlashcards] = useState<Flashcard[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : [];
      } catch (e) {
        console.error("Failed to load flashcards:", e);
        return [];
      }
    }
    return [];
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Selection for Printing
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());

  // PDF Generating State
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Study Mode State
  const [studyBatchId, setStudyBatchId] = useState<string | null>(null);

  // Delete Confirmation State
  const [batchToDelete, setBatchToDelete] = useState<string | null>(null);

  // Banner Visibility State for Dynamic Padding
  const [isBannerVisible, setIsBannerVisible] = useState(false);
  
  // Save to local storage whenever flashcards change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flashcards));
  }, [flashcards]);

  // Group cards by Batch ID
  const batches = React.useMemo(() => {
    const groups: Record<string, Flashcard[]> = {};
    flashcards.forEach(card => {
      if (!groups[card.batchId]) groups[card.batchId] = [];
      groups[card.batchId].push(card);
    });
    // Sort keys (dates) descending
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [flashcards]);

  const toggleBatchSelection = (batchId: string) => {
    const newSet = new Set(selectedBatchIds);
    if (newSet.has(batchId)) {
      newSet.delete(batchId);
    } else {
      newSet.add(batchId);
    }
    setSelectedBatchIds(newSet);
  };

  const handleDownloadPdf = async () => {
    if (selectedBatchIds.size === 0) return;

    setIsGeneratingPdf(true);
    
    // Prepare data
    const selectedBatchesList = batches
      .filter(([id]) => selectedBatchIds.has(id))
      .map(([id, cards]) => ({ id, cards }));

    // Small delay to allow UI to show "Generating" state before synchronous JS freezes UI
    setTimeout(() => {
      try {
        generatePDF(selectedBatchesList);
      } catch (error) {
        alert("PDF Generation failed: " + error);
      } finally {
        setIsGeneratingPdf(false);
      }
    }, 100);
  };

  const generateTestData = () => {
    const timestamp = new Date();
    const batchId = `TEST-DATA-${timestamp.getFullYear()}-${timestamp.getMonth()+1}-${timestamp.getDate()}-${Date.now().toString().slice(-4)}`;
    
    const testWords = [
      { w: "Serendipity", i: "/ˌsɛrənˈdɪpɪti/", t: "Baxtli tasodif", d: "The occurrence of events by chance in a happy or beneficial way.", e: "Meeting my old friend was pure serendipity." },
      { w: "Ephemeral", i: "/əˈfɛmərəl/", t: "O'tkinchi", d: "Lasting for a very short time.", e: "Fashions are ephemeral, changing with every season." },
      { w: "Resilient", i: "/rɪˈzɪlɪənt/", t: "Chidamli", d: "Able to withstand or recover quickly from difficult conditions.", e: "Babies are often more resilient than we give them credit for." },
      { w: "Eloquent", i: "/ˈɛləkwənt/", t: "Notiq", d: "Fluent or persuasive in speaking or writing.", e: "She made an eloquent speech defending her position." },
      { w: "Meticulous", i: "/məˈtɪkjʊləs/", t: "Sinuskov", d: "Showing great attention to detail; very careful and precise.", e: "He was meticulous about keeping his records organized." },
      { w: "Ubiquitous", i: "/juːˈbɪkwɪtəs/", t: "Hamma joyda mavjud", d: "Present, appearing, or found everywhere.", e: "Smartphones have become ubiquitous in modern society." },
      { w: "Pragmatic", i: "/praɡˈmatɪk/", t: "Amaliy", d: "Dealing with things sensibly and realistically.", e: "We need a pragmatic approach to solve this problem." },
      { w: "Empathy", i: "/ˈɛmpəθi/", t: "Hamdardlik", d: "The ability to understand and share the feelings of another.", e: "Nurses need a great deal of empathy for their patients." },
      { w: "Ambiguous", i: "/amˈbɪɡjʊəs/", t: "Mavhum", d: "Open to more than one interpretation; not having one obvious meaning.", e: "The instructions were ambiguous and difficult to follow." },
      { w: "Nostalgia", i: "/nɒˈstaldʒə/", t: "Sog'inch", d: "A sentimental longing for the past.", e: "Listening to old songs fills me with nostalgia." },
      { w: "Candid", i: "/ˈkandɪd/", t: "Samimiy", d: "Truthful and straightforward; frank.", e: "To be candid, I don't think this is a good idea." },
      { w: "Enigma", i: "/ɪˈnɪɡmə/", t: "Jumboq", d: "A person or thing that is mysterious or difficult to understand.", e: "The disappearance of the plane remains an enigma." }
    ];

    const newCards: Flashcard[] = testWords.map((item, idx) => ({
      id: `test-${batchId}-${idx}`,
      word: item.w,
      ipa: item.i,
      translation: item.t,
      definition: item.d,
      example: item.e,
      batchId: batchId,
      createdAt: Date.now() + idx
    }));

    setFlashcards(prev => [...newCards, ...prev]);
  };

  const handleGenerate = async () => {
    const rawInput = input.trim();
    if (!rawInput) return;

    const wordsToProcess = rawInput.split(/[\n,]+/).map(w => w.trim()).filter(w => w.length > 0);
    const uniqueNewWords = wordsToProcess.filter(
      w => !flashcards.some(existing => existing.word.toLowerCase() === w.toLowerCase())
    );

    if (uniqueNewWords.length === 0) {
      alert("No new words found.");
      return;
    }

    setIsLoading(true);
    try {
      const chunkSize = 12;
      for (let i = 0; i < uniqueNewWords.length; i += chunkSize) {
        const chunk = uniqueNewWords.slice(i, i + chunkSize);
        const results = await extractWords(chunk.join(', '));
        
        const timestamp = new Date();
        const batchId = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')} Batch ${Math.floor(i/12) + 1}`;

        const newCards: Flashcard[] = results.map(res => ({
          id: Math.random().toString(36).substring(2, 11),
          word: res.word,
          ipa: res.ipa,
          translation: res.translation,
          definition: res.definition,
          example: res.example,
          batchId: batchId,
          createdAt: Date.now()
        }));

        setFlashcards(prev => [...newCards, ...prev]);
      }
      setInput('');
    } catch (error) {
      alert("Error: " + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const requestDeleteBatch = (e: React.MouseEvent, batchId: string) => {
    e.stopPropagation(); // Prevent triggering other clicks (like Start Study)
    setBatchToDelete(batchId);
  };

  const confirmDeleteBatch = () => {
    if (batchToDelete) {
      setFlashcards(prev => prev.filter(c => c.batchId !== batchToDelete));
      if (selectedBatchIds.has(batchToDelete)) {
        const newSet = new Set(selectedBatchIds);
        newSet.delete(batchToDelete);
        setSelectedBatchIds(newSet);
      }
      setBatchToDelete(null);
    }
  };

  const clearAll = () => {
    if (confirm("Barcha lug'atlarni o'chirib yubormoqchimisiz?")) {
      setFlashcards([]);
      setSelectedBatchIds(new Set());
    }
  };

  // Prepare Active Study Batch
  const activeStudyCards = studyBatchId ? batches.find(b => b[0] === studyBatchId)?.[1] || [] : [];

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-900">
      
      {/* PWA INSTALL BANNER */}
      <InstallBanner onVisibilityChange={setIsBannerVisible} />

      {/* 1. STUDY MODE OVERLAY */}
      {studyBatchId && (
        <div className="fixed inset-0 z-50 bg-white">
          <StudySession 
            cards={activeStudyCards} 
            onExit={() => setStudyBatchId(null)} 
          />
        </div>
      )}

      {/* 2. DELETE CONFIRMATION MODAL */}
      {batchToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 transform scale-100 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-black text-slate-900 mb-2">O'chirishni tasdiqlang</h3>
              <p className="text-slate-500 text-sm mb-6">
                Test to'plami: <strong>{batchToDelete}</strong><br/>
                O'chirib yuborilsinmi?
              </p>
              <div className="flex gap-3 w-full">
                <button 
                  onClick={() => setBatchToDelete(null)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-slate-700 font-bold rounded-xl transition-colors text-xs uppercase tracking-wider"
                >
                  Yo'q
                </button>
                <button 
                  onClick={confirmDeleteBatch}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors text-xs uppercase tracking-wider shadow-lg shadow-red-200"
                >
                  Ha
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. MAIN DASHBOARD */}
      <div className={`transition-all duration-300 ${isBannerVisible ? 'pt-16' : ''}`}>
        {/* Header */}
        <header className="bg-slate-900 text-white py-6 px-4">
          <div className="max-w-4xl mx-auto flex justify-between items-center">
            <div>
              <h1 className="text-xl font-black tracking-tighter">FLASH-XB7</h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400 mt-1">Daily Vocabulary System</p>
            </div>
            <div className="flex gap-2">
              <button onClick={generateTestData} className="text-[9px] bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold uppercase tracking-widest px-3 py-1.5 rounded transition-colors">
                + Demo
              </button>
              {flashcards.length > 0 && (
                <button onClick={clearAll} className="text-[9px] bg-slate-800 hover:bg-slate-700 text-red-400 font-bold uppercase tracking-widest px-3 py-1.5 rounded transition-colors">
                  Reset
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto w-full px-4 py-8 pb-32">
          
          {/* Input Section */}
          <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-10">
             <label className="block text-[10px] font-black text-slate-400 uppercase mb-3 tracking-[0.15em]">
               Yangi so'zlar qo'shish (12 talik guruhlarga bo'linadi)
             </label>
             <div className="flex gap-4 items-start">
               <textarea
                 className="flex-1 p-4 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 outline-none h-24 text-sm placeholder:text-slate-300 font-medium resize-none"
                 placeholder="So'zlarni vergul yoki yangi qator bilan kiriting..."
                 value={input}
                 onChange={(e) => setInput(e.target.value)}
                 disabled={isLoading}
               />
               <button
                 onClick={handleGenerate}
                 disabled={isLoading || !input.trim()}
                 className={`h-24 px-6 rounded-lg font-black text-xs tracking-widest uppercase transition-all ${
                   isLoading 
                     ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                     : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-200'
                 }`}
               >
                 {isLoading ? '...' : 'Add'}
               </button>
             </div>
          </section>

          {/* Batches Grid */}
          <section>
            <div className="flex justify-between items-end mb-6">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                Sizning To'plamlaringiz
              </h2>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {batches.length} Collections
              </span>
            </div>

            {batches.length === 0 ? (
              <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-xl">
                <p className="text-slate-400 font-medium text-sm">Hozircha hech narsa yo'q. Yuqorida so'z qo'shing!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {batches.map(([id, cards]) => (
                  <div 
                    key={id}
                    className={`relative bg-white border rounded-xl p-5 transition-all hover:border-indigo-200 hover:shadow-md ${
                      selectedBatchIds.has(id) ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50/10' : 'border-slate-200'
                    }`}
                  >
                    {/* Header: Date & Count */}
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">{id}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                          {cards.length} Cards
                        </p>
                      </div>
                      <button 
                        onClick={(e) => requestDeleteBatch(e, id)}
                        className="text-slate-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-full group"
                        title="O'chirish"
                      >
                        <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 items-center">
                      <button
                        onClick={() => setStudyBatchId(id)}
                        className="flex-1 bg-slate-900 text-white py-3 rounded-lg font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 active:scale-95"
                      >
                        Start Study
                      </button>
                      
                      <div 
                        className="flex items-center justify-center w-12 h-full cursor-pointer group"
                        onClick={() => toggleBatchSelection(id)}
                        title="Select for PDF Print"
                      >
                        <input 
                          type="checkbox"
                          checked={selectedBatchIds.has(id)}
                          onChange={() => toggleBatchSelection(id)}
                          className="w-5 h-5 accent-indigo-600 cursor-pointer group-hover:ring-2 ring-indigo-200 rounded"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </main>
        
        {/* Sticky Print Action Bar */}
        {selectedBatchIds.size > 0 && (
          <div className="fixed bottom-6 left-0 right-0 z-40 flex justify-center animate-in slide-in-from-bottom-4">
            <button
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="bg-indigo-600 text-white px-8 py-4 rounded-full font-black text-xs uppercase tracking-[0.2em] shadow-2xl hover:bg-indigo-500 transition-all active:scale-95 flex items-center gap-3 disabled:opacity-70 disabled:cursor-wait"
            >
              {isGeneratingPdf ? (
                 <>
                   <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                   Generating...
                 </>
              ) : (
                 <>
                   <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                   Download PDF ({selectedBatchIds.size})
                 </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
