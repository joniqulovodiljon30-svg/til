import React, { useState, useEffect, useMemo } from 'react';
import { Flashcard, SupportedLanguage } from './types';
import { extractWords } from './services/vocabService';
import { generatePDF } from './services/pdfGenerator';
import StudySession from './components/StudySession';
import InstallBanner from './components/InstallBanner';
import SecurityHandler from './components/SecurityHandler';
import { useSecurity } from './hooks/useSecurity';

const STORAGE_KEY = 'vocab_pro_flashcards_v1';

// --- FAKE 404 COMPONENT ---
const Fake404 = () => (
  <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4 text-center font-sans">
    <h1 className="text-9xl font-black text-gray-200">404</h1>
    <h2 className="text-2xl font-bold text-gray-800 mt-4">Page Not Found</h2>
    <p className="text-gray-500 mt-2 max-w-md">
      The page you are looking for does not exist or has been moved.
    </p>
    <div className="mt-8 px-6 py-3 bg-gray-100 text-gray-400 rounded text-sm font-mono">
      Error Code: NOT_FOUND
    </div>
  </div>
);

// --- MAIN DASHBOARD COMPONENT ---
const Dashboard: React.FC = () => {
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
  const [targetLanguage, setTargetLanguage] = useState<SupportedLanguage>('en'); // Default English
  
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
  const batches = useMemo(() => {
    const groups: Record<string, Flashcard[]> = {};
    flashcards.forEach(card => {
      if (!groups[card.batchId]) groups[card.batchId] = [];
      groups[card.batchId].push(card);
    });
    // Sort keys (dates) descending
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [flashcards]);

  // Filter batches by CURRENT selected language
  const filteredBatches = useMemo(() => {
    return batches.filter(([_, cards]) => {
       // Assume batch belongs to the language of its first card
       return cards.length > 0 && cards[0].language === targetLanguage;
    });
  }, [batches, targetLanguage]);

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
    const dateStr = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')}`;
    
    // Create separate batches for each language so they appear in correct tabs
    const testSets = [
      { w: "Serendipity", i: "/ˌsɛrənˈdɪpɪti/", t: "Baxtli tasodif", d: "The occurrence of events by chance in a happy or beneficial way.", e: "Meeting my old friend was pure serendipity.", l: 'en' as SupportedLanguage },
      { w: "Gato", i: "/ˈgato/", t: "Mushuk", d: "Mamífero felino doméstico.", e: "El gato duerme en el sofá.", l: 'es' as SupportedLanguage },
      { w: "你好", i: "nǐ hǎo", t: "Salom", d: "Hello; How are you?", e: "你好，很高兴见到你。", l: 'zh' as SupportedLanguage }
    ];

    const newCards: Flashcard[] = testSets.map((item, idx) => ({
      id: `test-${item.l}-${Date.now()}-${idx}`,
      word: item.w,
      ipa: item.i,
      translation: item.t,
      definition: item.d,
      example: item.e,
      batchId: `Demo (${item.l.toUpperCase()}) ${dateStr}`,
      language: item.l,
      createdAt: Date.now() + idx
    }));

    setFlashcards(prev => [...newCards, ...prev]);
    setNotification({ message: "Demo ma'lumotlar qo'shildi!", type: 'success' });
  };

  const handleGenerate = async () => {
    const rawInput = input.trim();
    if (!rawInput) {
      setNotification({ message: "Iltimos, so'zlarni kiriting!", type: 'error' });
      return;
    }

    // --- ROBUST PARSING LOGIC ---
    const cleanWords = rawInput
      .split(/[\n,]/) 
      .map(line => line.replace(/^[\d\.\)\-\*\•\>]+/, '').trim())
      .filter(w => w.length > 0); // Allow single chars for Chinese
    
    const extractedWords = cleanWords.map(w => {
       const parts = w.split(/[\-–—]/);
       return parts[0].trim();
    });

    const finalWordsToProcess: string[] = Array.from(new Set(extractedWords));

    if (finalWordsToProcess.length === 0) {
      setNotification({ message: "Yaroqli so'zlar topilmadi.", type: 'error' });
      return;
    }

    setIsLoading(true);
    
    const today = new Date();
    const batchId = `List (${targetLanguage.toUpperCase()}) ${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    try {
      const chunkSize = 10;
      let allNewCards: Flashcard[] = [];

      for (let i = 0; i < finalWordsToProcess.length; i += chunkSize) {
        const chunk = finalWordsToProcess.slice(i, i + chunkSize);
        
        // Pass LANGUAGE to service
        const results = await extractWords(chunk, targetLanguage);
        
        const chunkCards: Flashcard[] = results.map(res => ({
          id: Math.random().toString(36).substring(2, 11),
          word: res.word,
          ipa: res.ipa,
          audio: res.audio,
          translation: res.translation,
          definition: res.definition,
          example: res.example,
          batchId: batchId, 
          language: targetLanguage, // Store language
          createdAt: Date.now()
        }));

        allNewCards = [...allNewCards, ...chunkCards];
      }

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
  // Get language of study batch (assume batch is mono-lingual, or take first card)
  const studyBatchLang = activeStudyCards.length > 0 ? activeStudyCards[0].language : 'en';

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
            <span className="font-bold text-sm">{notification.message}</span>
          </div>
        </div>
      )}

      {/* LOADING OVERLAY */}
      {isLoading && (
        <div className="fixed inset-0 z-[70] bg-white/50 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-500">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-black text-indigo-600">AI</span>
            </div>
          </div>
          <p className="mt-4 text-slate-900 font-black text-lg tracking-widest uppercase animate-pulse">
            Tahlil qilinmoqda ({targetLanguage.toUpperCase()})...
          </p>
        </div>
      )}

      {/* STUDY MODE OVERLAY */}
      {studyBatchId && (
        <div className="fixed inset-0 z-50 bg-white">
          <StudySession 
            cards={activeStudyCards} 
            onExit={() => setStudyBatchId(null)} 
            language={studyBatchLang}
          />
        </div>
      )}

      {/* DELETE MODAL */}
      {batchToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
             <div className="flex flex-col items-center text-center">
              <h3 className="text-lg font-black text-slate-900 mb-2">O'chirishni tasdiqlang</h3>
              <p className="text-slate-500 text-sm mb-6">
                To'plam: <strong>{batchToDelete}</strong><br/>
                O'chirib yuborilsinmi?
              </p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setBatchToDelete(null)} className="flex-1 py-3 bg-gray-100 font-bold rounded-xl text-xs uppercase">Yo'q</button>
                <button onClick={confirmDeleteBatch} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl text-xs uppercase">Ha</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN DASHBOARD */}
      <div className={`transition-all duration-300 ${isBannerVisible ? 'pt-16' : ''}`}>
        {/* Header */}
        <header className="bg-slate-900 text-white py-6 px-4">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-center md:text-left">
              <h1 className="text-xl font-black tracking-tighter">FLASH-XB7</h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400 mt-1">Multi-Lingual Vocabulary</p>
            </div>
            
            {/* LANGUAGE SWITCHER */}
            <div className="bg-slate-800 p-1 rounded-lg flex gap-1">
              <button 
                onClick={() => setTargetLanguage('en')}
                className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${targetLanguage === 'en' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                🇬🇧 ENG
              </button>
              <button 
                onClick={() => setTargetLanguage('es')}
                className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${targetLanguage === 'es' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                🇪🇸 ESP
              </button>
              <button 
                onClick={() => setTargetLanguage('zh')}
                className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${targetLanguage === 'zh' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                🇨🇳 CHN
              </button>
            </div>

            <div className="flex gap-2">
              <button onClick={generateTestData} className="text-[9px] bg-slate-800 text-emerald-400 font-bold uppercase px-3 py-1.5 rounded">+ Demo</button>
              {flashcards.length > 0 && (
                <button onClick={clearAll} className="text-[9px] bg-slate-800 text-red-400 font-bold uppercase px-3 py-1.5 rounded">Reset</button>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto w-full px-4 py-8 pb-32">
          
          {/* Input Section */}
          <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-10 relative overflow-hidden">
             {/* Background Flag Hint */}
             <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <span className="text-9xl font-black text-slate-900">
                  {targetLanguage === 'en' ? 'EN' : targetLanguage === 'es' ? 'ES' : 'ZH'}
                </span>
             </div>

             <label className="block text-[10px] font-black text-slate-400 uppercase mb-3 tracking-[0.15em]">
               Add Words ({targetLanguage === 'en' ? 'English' : targetLanguage === 'es' ? 'Spanish' : 'Chinese/Hanzi'})
             </label>
             <div className="flex gap-4 items-start z-10 relative">
               <textarea
                 className="flex-1 p-4 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 outline-none h-32 text-sm placeholder:text-slate-300 font-medium resize-none"
                 placeholder={targetLanguage === 'zh' ? "你好\n世界\n..." : "Paste your list here..."}
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
                   <span>...</span>
                 ) : (
                   <>
                    <span>Add</span>
                    <span className="text-[8px] opacity-70">{targetLanguage.toUpperCase()}</span>
                   </>
                 )}
               </button>
             </div>
          </section>

          {/* Batches Grid with Filtered View */}
          <section>
            <div className="flex justify-between items-end mb-6">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                Collections ({targetLanguage.toUpperCase()})
              </h2>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {filteredBatches.length} Sets
              </span>
            </div>

            {filteredBatches.length === 0 ? (
               // EMPTY STATE PLACEHOLDER
               <div className="border-2 border-dashed border-slate-200 rounded-3xl p-12 flex flex-col items-center justify-center text-center h-64 animate-in fade-in duration-500">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 text-slate-300">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                  </div>
                  <p className="text-slate-400 font-bold text-sm">Hozircha hech narsa yo'q. Yuqorida so'z qo'shing!</p>
               </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {filteredBatches.map(([id, cards]) => {
                     // Detect language from first card
                     const batchLang = cards[0]?.language || 'en';
                     const langFlag = batchLang === 'en' ? '🇬🇧' : batchLang === 'es' ? '🇪🇸' : '🇨🇳';

                     return (
                      <div 
                        key={id}
                        className={`relative bg-white border rounded-xl p-5 transition-all hover:border-indigo-200 hover:shadow-md animate-in fade-in zoom-in-95 duration-300 ${
                          selectedBatchIds.has(id) ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50/10' : 'border-slate-200'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <div className="flex items-center gap-2">
                               <span className="text-lg">{langFlag}</span>
                               <h3 className="font-bold text-slate-900 text-sm truncate max-w-[150px]">{id}</h3>
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 ml-7">
                              {cards.length} Cards
                            </p>
                          </div>
                          <button 
                            onClick={(e) => requestDeleteBatch(e, id)}
                            className="text-slate-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-full"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>

                        <div className="flex gap-3 items-center">
                          <button
                            onClick={() => setStudyBatchId(id)}
                            className="flex-1 bg-slate-900 text-white py-3 rounded-lg font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                          >
                            Study
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
                              className="w-5 h-5 accent-indigo-600 cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
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

// --- APP ROOT COMPONENT ---
// Separated to ensure hooks are always called in the same order.
const App: React.FC = () => {
  const { blocked } = useSecurity();
  const [currentPath] = useState(window.location.pathname);

  // If we are at /security, render handler (hooks inside SecurityHandler are consistent)
  if (currentPath === '/security') {
    return <SecurityHandler />;
  }

  // If blocked, show 404
  if (blocked) {
    return <Fake404 />;
  }

  return <Dashboard />;
};

export default App;