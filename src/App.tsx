import React, { useState, useEffect, useMemo } from 'react';
import { Flashcard, SupportedLanguage } from '../types';
import { extractWords } from '../services/vocabService';
import { generatePDF } from '../services/pdfGenerator';
import StudySession from './components/StudySession';
import InstallBanner from './components/InstallBanner';
import SecurityHandler from './components/SecurityHandler';
import { useSecurity } from './hooks/useSecurity';
import ImageWordFinder from './components/ImageWordFinder';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useFlashcards } from './hooks/useFlashcards';
import { AuthModal } from './components/AuthModal';
import { MigrationPrompt } from './components/MigrationPrompt';
import { Header } from './components/Header';
import { Collections } from './components/Collections';

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
  const { user, signOut } = useAuth();
  const {
    flashcards,
    loading: flashcardsLoading,
    syncing,
    syncError,
    addFlashcards,
    addDemoCards,
    deleteBatch,
    deleteFlashcard,
    toggleMistake,
    syncLocalToSupabase,
    hasLocalData,
  } = useFlashcards();

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<SupportedLanguage>('en');

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
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // OCR Modal State
  const [showOcrModal, setShowOcrModal] = useState(false);

  // Auth Modal State
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Migration Prompt State
  const [showMigrationPrompt, setShowMigrationPrompt] = useState(false);
  const [migrationChecked, setMigrationChecked] = useState(false);

  // Check for migration on first login
  useEffect(() => {
    if (user && !migrationChecked && hasLocalData()) {
      setShowMigrationPrompt(true);
      setMigrationChecked(true);
    }
  }, [user, migrationChecked, hasLocalData]);

  // Clear notification after 3 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Group cards by Batch ID
  const toggleBatchSelection = (batchId: string) => {
    const newSet = new Set(selectedBatchIds);
    if (newSet.has(batchId)) {
      newSet.delete(batchId);
    } else {
      newSet.add(batchId);
    }
    setSelectedBatchIds(newSet);
  };

  // Handle Toggle Mistake
  const handleToggleMistake = async (cardId: string) => {
    await toggleMistake(cardId);
  };

  // Group cards by Batch ID
  const batches = useMemo(() => {
    const groups: Record<string, Flashcard[]> = {};

    // Add "Mistakes" collection first if exists
    const mistakeCards = flashcards.filter((c) => c.isMistake);
    if (mistakeCards.length > 0) {
      groups['Mistakes'] = mistakeCards;
    }

    flashcards.forEach((card) => {
      if (!groups[card.batchId]) groups[card.batchId] = [];
      groups[card.batchId].push(card);
    });

    // Sort keys (dates) descending, but keep Mistakes at top
    return Object.entries(groups).sort((a, b) => {
      if (a[0] === 'Mistakes') return -1;
      if (b[0] === 'Mistakes') return 1;
      return b[0].localeCompare(a[0]);
    });
  }, [flashcards]);

  // Extract unique batch IDs for Smart Import dropdown
  const existingBatchIds = useMemo(() => {
    const uniqueBatches = new Set(flashcards.map((c) => c.batchId));
    return Array.from(uniqueBatches).sort().reverse();
  }, [flashcards]);

  // Filter batches by CURRENT selected language
  const filteredBatches = useMemo(() => {
    return batches
      .map(([id, cards]) => {
        if (id === 'Mistakes') {
          // Filter mistakes by language
          const langMistakes = cards.filter((c) => c.language === targetLanguage);
          return [id, langMistakes] as [string, Flashcard[]];
        }
        return [id, cards] as [string, Flashcard[]];
      })
      .filter(([id, cards]) => {
        if (id === 'Mistakes') return cards.length > 0;
        return cards.length > 0 && cards[0].language === targetLanguage;
      });
  }, [batches, targetLanguage]);

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
        alert('PDF Generation failed: ' + error);
      } finally {
        setIsGeneratingPdf(false);
      }
    }, 100);
  };

  const handleAddDemo = async () => {
    await addDemoCards(targetLanguage);
    setNotification({ message: `Demo cards added for ${targetLanguage.toUpperCase()}!`, type: 'success' });
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
      .map((line) => line.replace(/^[\d\.\)\-\*\•\>]+/, '').trim())
      .filter((w) => w.length > 0);

    const extractedWords = cleanWords.map((w) => {
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

        const chunkCards: Flashcard[] = results.map((res) => ({
          id: Math.random().toString(36).substring(2, 11),
          word: res.word,
          ipa: res.ipa,
          audio: res.audio,
          translation: res.translation,
          definition: res.definition,
          example: res.example,
          batchId: batchId,
          language: targetLanguage,
          createdAt: Date.now(),
        }));

        allNewCards = [...allNewCards, ...chunkCards];
      }

      // Filter duplicates
      const existingWords = new Set(flashcards.map((c) => c.word.toLowerCase()));
      const uniqueNewCards = allNewCards.filter((c) => !existingWords.has(c.word.toLowerCase()));

      if (uniqueNewCards.length < allNewCards.length) {
        setNotification({ message: "Ba'zi so'zlar allaqachon mavjud edi va qo'shilmadi.", type: 'success' });
      } else {
        setNotification({ message: "Barcha so'zlar muvaffaqiyatli qo'shildi!", type: 'success' });
      }

      await addFlashcards(uniqueNewCards);
      setInput('');
    } catch (error) {
      setNotification({ message: 'Xatolik: ' + (error as Error).message, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const requestDeleteBatch = (e: React.MouseEvent, batchId: string) => {
    e.stopPropagation();
    setBatchToDelete(batchId);
  };

  const confirmDeleteBatch = async () => {
    if (batchToDelete) {
      await deleteBatch(batchToDelete);
      if (selectedBatchIds.has(batchToDelete)) {
        const newSet = new Set(selectedBatchIds);
        newSet.delete(batchToDelete);
        setSelectedBatchIds(newSet);
      }
      setBatchToDelete(null);
    }
  };

  const clearAll = async () => {
    if (confirm("Barcha lug'atlarni o'chirib yubormoqchimisiz?")) {
      // Delete all batches
      for (const [batchId] of batches) {
        await deleteBatch(batchId);
      }
      setSelectedBatchIds(new Set());
    }
  };

  const handleMigration = async () => {
    const result = await syncLocalToSupabase();
    if (result.success) {
      setNotification({ message: 'Data successfully synced to your account!', type: 'success' });
      setShowMigrationPrompt(false);
    } else {
      setNotification({ message: result.error || 'Migration failed', type: 'error' });
    }
    return result;
  };

  const handleLogout = async () => {
    await signOut();
    setMigrationChecked(false);
    setNotification({ message: 'Logged out successfully', type: 'success' });
  };

  // Prepare Active Study Batch
  const activeStudyCards = studyBatchId ? batches.find((b) => b[0] === studyBatchId)?.[1] || [] : [];
  const studyBatchLang = activeStudyCards.length > 0 ? activeStudyCards[0].language : 'en';

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-900 relative">
      {/* PWA INSTALL BANNER */}
      <InstallBanner onVisibilityChange={setIsBannerVisible} />

      {/* NOTIFICATION TOAST */}
      {notification && (
        <div
          className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-2xl animate-in slide-in-from-top fade-in duration-300 ${notification.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
            }`}
        >
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">{notification.message}</span>
          </div>
        </div>
      )}

      {/* LOADING OVERLAY */}
      {(isLoading || flashcardsLoading) && (
        <div className="fixed inset-0 z-[70] bg-white/50 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-500">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-black text-indigo-600">AI</span>
            </div>
          </div>
          <p className="mt-4 text-slate-900 font-black text-lg tracking-widest uppercase animate-pulse">
            {flashcardsLoading ? 'Loading...' : `Tahlil qilinmoqda (${targetLanguage.toUpperCase()})...`}
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
            onToggleMistake={handleToggleMistake}
            onDeleteCard={deleteFlashcard}
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
                To'plam: <strong>{batchToDelete}</strong>
                <br />
                O'chirib yuborilsinmi?
              </p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setBatchToDelete(null)} className="flex-1 py-3 bg-gray-100 font-bold rounded-xl text-xs uppercase">
                  Yo'q
                </button>
                <button onClick={confirmDeleteBatch} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl text-xs uppercase">
                  Ha
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AUTH MODAL */}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

      {/* MIGRATION PROMPT */}
      {showMigrationPrompt && (
        <MigrationPrompt
          localCardCount={hasLocalData() ? JSON.parse(localStorage.getItem('vocab_pro_flashcards_v1') || '[]').length : 0}
          onSync={handleMigration}
          onSkip={() => setShowMigrationPrompt(false)}
        />
      )}

      {/* MAIN DASHBOARD */}
      <div className={`transition-all duration-300 ${isBannerVisible ? 'pt-16' : ''}`}>
        {/* Header */}
        <header className="bg-slate-900 text-white py-6 px-4">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-center md:text-left flex items-center gap-3">
              <img src="/logo.png" alt="Flash-XB7" className="h-14 w-auto object-contain rounded-full border-2 border-slate-700" />
              <div>
                <h1 className="text-2xl font-black tracking-tighter loading-none">Vocab AI Pro</h1>
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-400">Multi-Lingual Vocabulary</p>
              </div>
            </div>

            {/* LANGUAGE SWITCHER */}
            <div className="bg-slate-800 p-1 rounded-lg flex gap-1">
              <button
                onClick={() => setTargetLanguage('en')}
                className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${targetLanguage === 'en' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                  }`}
              >
                🇬🇧 ENG
              </button>
              <button
                onClick={() => setTargetLanguage('es')}
                className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${targetLanguage === 'es' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                  }`}
              >
                🇪🇸 ESP
              </button>
              <button
                onClick={() => setTargetLanguage('zh')}
                className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${targetLanguage === 'zh' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                  }`}
              >
                🇨🇳 CHN
              </button>
            </div>

            <div className="flex gap-2 items-center">
              <Header onLoginClick={() => setShowAuthModal(true)} />
              <button onClick={handleAddDemo} className="text-[9px] bg-purple-600 text-white font-bold uppercase px-3 py-1.5 rounded hover:bg-purple-500">
                + Demo
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto w-full px-4 py-8 pb-32">
          {/* Input Section */}
          <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-10 relative overflow-hidden">
            {/* Background Flag Hint */}
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <span className="text-9xl font-black text-slate-900">{targetLanguage === 'en' ? 'EN' : targetLanguage === 'es' ? 'ES' : 'ZH'}</span>
            </div>

            <div className="flex justify-between items-center mb-3">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">
                Add Words ({targetLanguage === 'en' ? 'English' : targetLanguage === 'es' ? 'Spanish' : 'Chinese/Hanzi'})
              </label>
              <button
                onClick={() => setShowOcrModal(true)}
                className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
              >
                <span>📸</span> Find Words
              </button>
            </div>
            <div className="flex gap-4 items-start z-10 relative">
              <textarea
                className="flex-1 p-4 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 outline-none h-32 text-sm placeholder:text-slate-300 font-medium resize-none"
                placeholder={targetLanguage === 'zh' ? '你好\n世界\n...' : 'Paste your list here...'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
              />
              <button
                onClick={handleGenerate}
                disabled={isLoading || !input.trim()}
                className={`h-32 px-6 rounded-lg font-black text-xs tracking-widest uppercase transition-all flex flex-col items-center justify-center gap-2 ${isLoading ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-200'
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

          {/* OCR MODAL */}
          {showOcrModal && (
            <ImageWordFinder
              onClose={() => setShowOcrModal(false)}
              onAddWords={(words) => {
                const textToAdd = words.join('\n');
                setInput((prev) => (prev ? prev + '\n' + textToAdd : textToAdd));
                setShowOcrModal(false);
                setNotification({ message: `${words.length} words added from image!`, type: 'success' });
              }}
            />
          )}

          {/* Collections Section */}
          <section>
            <Collections
              flashcards={flashcards}
              activeLanguage={targetLanguage}
              onStudy={(batchId) => setStudyBatchId(batchId)}
              onDelete={(batchId) => setBatchToDelete(batchId)}
              loading={flashcardsLoading}
            />
          </section>

          {/* AUTHOR FOOTER */}
          <footer className="mt-20 mb-8 text-center flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
            <a href="https://t.me/MR_Odilxon" target="_blank" rel="noopener noreferrer" className="group flex flex-col items-center gap-2 hover:scale-105 transition-transform">
              <div className="bg-white p-1 rounded-full border border-slate-100 shadow-sm group-hover:shadow-md transition-shadow">
                <img src="https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg" alt="Telegram" className="w-8 h-8" />
              </div>
              <div className="flex flex-col items-center">
                <span className="text-sm font-bold text-slate-700 group-hover:text-indigo-600 transition-colors font-mono">@MR_Odilxon</span>
              </div>
            </a>
          </footer>
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
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
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
const App: React.FC = () => {
  const { isBlocked } = useSecurity();
  const [currentPath] = useState(window.location.pathname);

  // If we are at /security, render handler
  if (currentPath === '/security') {
    return <SecurityHandler />;
  }

  // If blocked, show 404
  if (isBlocked) {
    return <Fake404 />;
  }

  // Wrap with AuthProvider
  return (
    <AuthProvider>
      <Dashboard />
    </AuthProvider>
  );
};

export default App;
