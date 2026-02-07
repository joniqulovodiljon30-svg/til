import React, { useState, useEffect } from 'react';
import { Flashcard } from './types';
import { extractWords } from './services/vocabService';
import { generatePDF } from './services/pdfGenerator';
import StudySession from './components/StudySession';
import InstallBanner from './components/InstallBanner';

const STORAGE_KEY = 'vocab_pro_flashcards_v1';

const App: React.FC = () => {
  // Lazy initialize state from localStorage
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

  // Banner Visibility State
  const [isBannerVisible, setIsBannerVisible] = useState(false);

  // Notification State
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  
  // Save to local storage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flashcards));
  }, [flashcards]);

  // Clear notification after 3 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

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

    // Small delay to allow UI to show "Generating" state
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
    const batchId = `Demo List ${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')}`;
    
    const testWords = [
      { w: "Serendipity", i: "/ˌsɛrənˈdɪpɪti/", t: "Baxtli tasodif", d: "The occurrence of events by chance in a happy or beneficial way.", e: "Meeting my old friend was pure serendipity." },
      { w: "Ability", i: "/əˈbɪləti/", t: "Qobiliyat", d: "Possession of the means or skill to do something.", e: "He has the ability to learn quickly." }
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
    if (!rawInput) {
      setNotification({ message: "Iltimos, so'zlarni kiriting!", type: 'error' });
      return;
    }

    // --- ROBUST PARSING LOGIC ---
    // 1. Split by newline OR comma to handle different paste formats
    // 2. Map through items to clean them up
    // 3. Filter valid words
    
    const cleanWords = rawInput
      .split(/[\n,]/) // Split by newline or comma
      .map(line => {
        // Remove leading numbering (e.g., "1.", "2)", "•", "-") and trim
        // Matches digits followed by . or ) at start, or bullet points
        return line.replace(/^[\d\.\)\-\*\•\>]+/, '').trim();
      })
      .filter(w => {
        // Keep if it has at least one letter and length > 1
        // Also remove purely symbolic strings
        return w.length > 1 && /[a-zA-Z]/.test(w);
      });
    
    // Remove "Word - Translation" parts if they pasted a definition list
    // We only want the first word before " - " or " – "
    const extractedWords = cleanWords.map(w => {
       const parts = w.split(/[\-–—]/);
       return parts[0].trim();
    });

    // Final clean of duplicates within the input
    const finalWordsToProcess: string[] = Array.from(new Set(extractedWords));

    if (finalWordsToProcess.length === 0) {
      setNotification({ message: "Yaroqli so'zlar topilmadi.", type: 'error' });
      return;
    }

    setIsLoading(true);
    
    // --- DAILY BATCHING LOGIC ---
    // Generate a single ID for today. All additions today go here.
    const today = new Date();
    const batchId = `Daily List ${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    try {
      // Process in chunks of 10 to respect API limits
      const chunkSize = 10;
      let allNewCards: Flashcard[] = [];

      for (let i = 0; i < finalWordsToProcess.length; i += chunkSize) {
        const chunk = finalWordsToProcess.slice(i, i + chunkSize);
        
        // Pass array directly to service
        const results = await extractWords(chunk);
        
        const chunkCards: Flashcard[] = results.map(res => ({
          id: Math.random().toString(36).substring(2, 11),
          word: res.word,
          ipa: res.ipa,
          audio: res.audio,
          translation: res.translation,
          definition: res.definition,
          example: res.example,
          batchId: batchId, // Unified Batch ID
          createdAt: Date.now()
        }));

        allNewCards = [...allNewCards, ...chunkCards];
      }

      // Check for duplicates against EXISTING cards to prevent re-adding same word
      // We only filter if the word already exists in the app to avoid clutter
      setFlashcards(prev => {
        const existingWords = new Set(prev.map(c => c.word.toLowerCase()));
        const uniqueNewCards = allNewCards.filter(c => !existingWords.has(c.word.toLowerCase()));
        
        if (uniqueNewCards.length < allNewCards.length) {
          setNotification({ message: "Ba'zi so'zlar allaqachon mavjud edi va qo'shilmadi.", type: 'success' });
        } else {
          setNotification({ message: "Barcha so'zlar muvaffaqiyatli qo'shildi!", type: 'success' });
        }
        
        return [...uniqueNewCards, ...prev];
      });

      setInput('');
    } catch (error) {
      setNotification({ message: "Xatolik: " + (error as Error).message, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const requestDeleteBatch = (e: React.MouseEvent, batchId: string) => {
    e.stopPropagation(); 
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
    <div className="min-h-screen bg-gray-50 font-sans text-slate-900 relative">
      
      {/* PWA INSTALL BANNER */}
      <InstallBanner onVisibilityChange={setIsBannerVisible} />

      {/* NOTIFICATION TOAST */}
      {notification && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-2xl animate-in slide-in-from-top fade-in duration-300 ${
          notification.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            )}
            <span className="font-bold text-sm">{notification.message}</span>
          </div>
        </div>
      )}

      {/* 1. LOADING OVERLAY (Blur Effect) */}
      {isLoading && (
        <div className="fixed inset-0 z-[70] bg-white/50 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-500">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-black text-indigo-600">AI</span>
            </div>
          </div>
          <p className="mt-4 text-slate-900 font-black text-lg tracking-widest uppercase animate-pulse">
            Tahlil qilinmoqda...
          </p>
          <p className="text-slate-500 text-sm mt-2">So'zlar yuklanmoqda ({input.split('\n').length} ta)</p>
        </div>
      )}

      {/* 2. STUDY MODE OVERLAY */}
      {studyBatchId && (
        <div className="fixed inset-0 z-50 bg-white">
          <StudySession 
            cards={activeStudyCards} 
            onExit={() => setStudyBatchId(null)} 
          />
        </div>
      )}

      {/* 3. DELETE CONFIRMATION MODAL */}
      {batchToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 transform scale-100 animate-in zoom-in-95 duration-200">
             {/* Delete Modal Content */}
             <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-black text-slate-900 mb-2">O'chirishni tasdiqlang</h3>
              <p className="text-slate-500 text-sm mb-6">
                To'plam: <strong>{batchToDelete}</strong><br/>
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

      {/* 4. MAIN DASHBOARD */}
      <div className={`transition-all duration-300 ${isBannerVisible ? 'pt-16' : ''}`}>
        {/* Header */}
        <header className="bg-slate-900 text-white py-6 px-4">
          <div className="max-w-4xl mx-auto flex justify-between items-start">
            <div>
              <h1 className="text-xl font-black tracking-tighter">FLASH-XB7</h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400 mt-1">Daily Vocabulary System</p>
            </div>
            
            {/* Right Side: Author & Demo */}
            <div className="flex flex-col items-end gap-2">
              <a 
                href="https://t.me/Mr_Odilxon" 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-white text-slate-900 px-4 py-1.5 rounded-full flex items-center gap-2 hover:bg-slate-100 transition-all active:scale-95 shadow-lg shadow-white/10 group"
              >
                <svg className="w-4 h-4 text-slate-900 group-hover:text-blue-500 transition-colors" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm-1-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm5 7h-2v-6h2v6z"/></svg>
                <span className="text-[10px] font-black uppercase tracking-wider">Loyiha muallifi</span>
              </a>

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
          </div>
        </header>

        <main className="max-w-4xl mx-auto w-full px-4 py-8 pb-32">
          
          {/* Input Section */}
          <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-10">
             <label className="block text-[10px] font-black text-slate-400 uppercase mb-3 tracking-[0.15em]">
               Yangi so'zlar qo'shish (Matn, Ro'yxat yoki Vergul bilan)
             </label>
             <div className="flex gap-4 items-start">
               <textarea
                 className="flex-1 p-4 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 outline-none h-32 text-sm placeholder:text-slate-300 font-medium resize-none"
                 placeholder={`Example:\nSerendipity\nEloquent\nResilient\n(Just paste your list here)`}
                 value={input}
                 onChange={(e) => setInput(e.target.value)}
                 disabled={isLoading}
               />
               <button
                 onClick={handleGenerate}
                 disabled={isLoading || !input.trim()}
                 className={`h-32 px-6 rounded-lg font-black text-xs tracking-widest uppercase transition-all flex flex-col items-center justify-center gap-2 ${
                   isLoading 
                     ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                     : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-200'
                 }`}
               >
                 {isLoading ? (
                   <>
                    <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin"></div>
                    <span>...</span>
                   </>
                 ) : (
                   <>
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    <span>Add</span>
                   </>
                 )}
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
