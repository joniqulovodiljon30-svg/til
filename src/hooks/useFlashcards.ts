import { useState, useEffect, useCallback, useRef } from 'react';
import { Flashcard, SupportedLanguage } from '../../types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const STORAGE_KEY = 'vocab_pro_flashcards_v1';
const SUPABASE_CACHE_KEY = 'vocab_pro_supabase_cache_v1';

// ⚠️ After changing Supabase schema, do a HARD REFRESH (Ctrl + F5)

interface UseFlashcardsReturn {
    flashcards: Flashcard[];
    loading: boolean;
    error: string | null;
    syncing: boolean;
    syncError: string | null;
    addFlashcards: (cards: Flashcard[]) => Promise<void>;
    addDemoCards: (language: SupportedLanguage) => Promise<void>;
    deleteFlashcard: (id: string) => Promise<void>;
    deleteBatch: (batchId: string) => Promise<void>;
    toggleMistake: (id: string) => Promise<void>;
    syncLocalToSupabase: () => Promise<{ success: boolean; error?: string }>;
    hasLocalData: () => boolean;
    refetch: () => Promise<void>;
}

const normalizeWord = (word: string): string => {
    return word.trim().toLowerCase();
};

const getTodayBatchId = (): string => {
    return new Date().toISOString().split('T')[0];
};

// --- SUPABASE CACHE HELPERS ---
const loadFromSupabaseCache = (): Flashcard[] => {
    try {
        const cached = localStorage.getItem(SUPABASE_CACHE_KEY);
        return cached ? JSON.parse(cached) : [];
    } catch {
        return [];
    }
};

const saveToSupabaseCache = (cards: Flashcard[]) => {
    try {
        localStorage.setItem(SUPABASE_CACHE_KEY, JSON.stringify(cards));
    } catch (e) { }
};

const DEMO_CARDS = {
    en: {
        word: 'Serendipity',
        ipa: '/ˌser.ənˈdɪp.ə.ti/',
        translation: 'Baxtli tasodif',
        definition: 'The occurrence of events by chance in a happy or beneficial way.',
        example: 'Meeting my old friend was pure serendipity.',
    },
    es: {
        word: 'Efímero',
        ipa: '/eˈfimeɾo/',
        translation: "O'tkinchi",
        definition: 'Que dura por un período de tiempo muy corto.',
        example: 'La belleza de las flores es efímera.',
    },
    zh: {
        word: '缘分',
        ipa: 'yuánfèn',
        translation: 'Taqdir',
        definition: 'Fate or destiny that brings people together.',
        example: '我们见面是缘分',
    },
};

export const useFlashcards = (): UseFlashcardsReturn => {
    const { user } = useAuth();
    const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);

    const syncTriggeredRef = useRef<string | null>(null);
    const initialLoadDoneRef = useRef(false);

    const hasLocalData = useCallback((): boolean => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (!saved) return false;
            const data = JSON.parse(saved);
            return Array.isArray(data) && data.length > 0;
        } catch {
            return false;
        }
    }, []);

    const loadFromLocalStorage = useCallback((): Flashcard[] => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    }, []);

    const saveToLocalStorage = useCallback((cards: Flashcard[]) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
        } catch (e) { }
    }, []);

    const loadFromSupabase = useCallback(async (silent = false) => {
        if (!user) return;

        try {
            // Faqat kesh bo'lmaganda loading spinner ko'rsatamiz
            if (!silent) {
                setLoading(true);
            }
            setError(null);

            // UNLIMITED: Limit va range olib tashlandi
            const { data, error: fetchError } = await (supabase
                .from('flashcards')
                .select('id, front, back, ipa, transcription, definition, example, category, batch_id, created_at, is_mistake, audio, user_id')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false }) as any);

            if (fetchError) throw fetchError;

            const cards: Flashcard[] = (data || []).map((row) => ({
                id: row.id,
                word: row.front,
                ipa: row.ipa || '',
                transcription: (row as any).transcription || row.ipa || '',
                audio: row.audio || undefined,
                translation: row.back,
                definition: (row as any).definition || '',
                example: (row as any).example || '',
                batchId: row.batch_id || row.category || 'General',
                language: row.category as SupportedLanguage,
                createdAt: new Date(row.created_at).getTime(),
                isMistake: (row as any).is_mistake ?? false,
            }));

            setFlashcards(cards);
            // Keshga saqlaymiz — keyingi safar darhol ko'rsatiladi
            saveToSupabaseCache(cards);
        } catch (e) {
            setError('Failed to load flashcards');
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (user) {
            // 1. Avval keshdan yuklaymiz (darhol, spinnersiz)
            const cachedCards = loadFromSupabaseCache();
            if (cachedCards.length > 0) {
                setFlashcards(cachedCards);
                setLoading(false);
                // Orqa fonda yangilaymiz (spinnersiz)
                loadFromSupabase(true);
            } else {
                // Kesh bo'lmaganda (birinchi marta) — spinner ko'rsatamiz
                loadFromSupabase(false);
            }
            initialLoadDoneRef.current = true;

            const channel = supabase
                .channel(`public:flashcards:user:${user.id}`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'flashcards', filter: `user_id=eq.${user.id}` },
                    () => loadFromSupabase(true) // Realtime yangilanishlar ham silent
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        } else {
            setFlashcards(loadFromLocalStorage());
            setLoading(false);
        }
    }, [user, loadFromSupabase, loadFromLocalStorage]);

    const addDemoCards = useCallback(
        async (language: SupportedLanguage) => {
            let demoData;
            switch (language) {
                case 'en': demoData = DEMO_CARDS.en; break;
                case 'es': demoData = DEMO_CARDS.es; break;
                case 'zh': demoData = DEMO_CARDS.zh; break;
                default: return;
            }

            const normalizedWord = normalizeWord(demoData.word);
            const todayBatch = getTodayBatchId();
            const demoBatchId = `DEMO-${language.toUpperCase()}-${todayBatch}`;

            // Check if demo already exists in this SPECIFIC batch
            const demoExists = flashcards.some((card) =>
                normalizeWord(card.word) === normalizedWord &&
                card.language === language &&
                card.batchId === demoBatchId
            );

            if (demoExists) return;

            const demoCard: Flashcard = {
                id: Math.random().toString(36).substring(2, 11),
                word: demoData.word,
                ipa: demoData.ipa,
                audio: undefined,
                translation: demoData.translation,
                definition: demoData.definition,
                example: demoData.example,
                batchId: demoBatchId,
                language: language,
                createdAt: Date.now(),
                isMistake: false,
            };

            await addFlashcards([demoCard]);
        },
        [flashcards]
    );

    const syncLocalToSupabase = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
        if (!user) return { success: false, error: 'User not authenticated' };

        if (syncTriggeredRef.current === user.id) return { success: true };

        try {
            setSyncing(true);
            const localCards = loadFromLocalStorage();
            if (localCards.length === 0) {
                setSyncing(false);
                return { success: true };
            }

            // UNLIMITED: Sinxronizatsiya uchun ham hamma so'zlarni olamiz
            const { data: existingCards, error: fetchError } = await supabase
                .from('flashcards')
                .select('front, category, batch_id')
                .eq('user_id', user.id);

            if (fetchError) throw fetchError;

            const existingPairs = new Set(
                (existingCards || []).map((card) =>
                    `${normalizeWord(card.front)}::${card.category}::${card.batch_id}`
                )
            );

            const newCards = localCards.filter((card) => {
                const normalizedPair = `${normalizeWord(card.word)}::${card.language}::${card.batchId || getTodayBatchId()}`;
                return !existingPairs.has(normalizedPair);
            });

            if (newCards.length > 0) {
                const dbCards = newCards.map((card) => ({
                    user_id: user.id,
                    front: card.word.trim(),
                    back: card.translation,
                    category: card.language,
                    audio: card.audio || '',
                    ipa: card.ipa || '',
                    definition: card.definition || '',
                    example: card.example || '',
                    batch_id: card.batchId || getTodayBatchId(),
                }));

                const { error: insertError } = await supabase.from('flashcards').insert(dbCards);
                if (insertError) throw insertError;
            }

            localStorage.removeItem(STORAGE_KEY);
            await loadFromSupabase();
            syncTriggeredRef.current = user.id;
            setSyncing(false);
            return { success: true };
        } catch (e) {
            setSyncing(false);
            return { success: false, error: 'Sync failed' };
        }
    }, [user, loadFromLocalStorage, loadFromSupabase]);

    const addFlashcards = useCallback(
        async (cards: Flashcard[]) => {
            // Faqat SHU BATCH ichida dublikatlarni filtrlaymiz, boshqa batchlardagi so'zlar to'smaydi
            const uniqueCards = cards.filter(newCard => {
                const normalizedNewWord = normalizeWord(newCard.word);
                return !flashcards.some((existingCard) =>
                    normalizeWord(existingCard.word) === normalizedNewWord &&
                    existingCard.language === newCard.language &&
                    existingCard.batchId === newCard.batchId
                );
            });

            const skippedCount = cards.length - uniqueCards.length;
            if (uniqueCards.length === 0) {
                if (skippedCount > 0) {
                    alert(`Barcha ${cards.length} ta so'z ushbu ro'yxatda allaqachon bor!`);
                }
                return;
            }
            if (skippedCount > 0) {
                console.log(`⏭️ ${skippedCount} ta so'z o'tkazib yuborildi (ushbu ro'yxatda allaqachon bor)`);
            }

            if (user) {
                try {
                    const dbCards = uniqueCards.map((card) => ({
                        user_id: user.id,
                        front: card.word.trim(),
                        back: card.translation,
                        category: card.language,
                        audio: card.audio || '',
                        ipa: card.ipa || '',
                        definition: card.definition || '',
                        example: card.example || '',
                        batch_id: card.batchId || getTodayBatchId(),
                    }));

                    const { error: insertError } = await supabase.from('flashcards').insert(dbCards);
                    if (insertError) {
                        if (insertError.message.includes('duplicate') || insertError.code === '23505') {
                            console.warn('⚠️ Bazada dublikat topildi, davom etamiz...');
                        } else {
                            throw insertError;
                        }
                    }
                    await loadFromSupabase();
                } catch (e) {
                    setError('Failed to add flashcards');
                }
            } else {
                setFlashcards((prev) => {
                    const updated = [...uniqueCards, ...prev];
                    saveToLocalStorage(updated);
                    return updated;
                });
            }
        },
        [user, flashcards, loadFromSupabase, saveToLocalStorage]
    );

    const deleteFlashcard = useCallback(
        async (id: string) => {
            if (user) {
                try {
                    const { error: deleteError } = await supabase.from('flashcards').delete().eq('id', id).eq('user_id', user.id);
                    if (deleteError) throw deleteError;
                    setFlashcards((prev) => prev.filter((c) => c.id !== id));
                } catch (e) {
                    await loadFromSupabase();
                }
            } else {
                setFlashcards((prev) => {
                    const updated = prev.filter((c) => c.id !== id);
                    saveToLocalStorage(updated);
                    return updated;
                });
            }
        },
        [user, loadFromSupabase, saveToLocalStorage]
    );

    const deleteBatch = useCallback(
        async (batchId: string) => {
            if (user) {
                try {
                    const { error: deleteError } = await supabase.from('flashcards').delete().eq('batch_id', batchId).eq('user_id', user.id);
                    if (deleteError) throw deleteError;
                    setFlashcards((prev) => prev.filter((c) => c.batchId !== batchId));
                } catch (e) {
                    await loadFromSupabase();
                }
            } else {
                setFlashcards((prev) => {
                    const updated = prev.filter((c) => c.batchId !== batchId);
                    saveToLocalStorage(updated);
                    return updated;
                });
            }
        },
        [user, loadFromSupabase, saveToLocalStorage]
    );

    const toggleMistake = useCallback(
        async (id: string) => {
            const card = flashcards.find(c => c.id === id);
            if (!card) return;

            const newValue = !card.isMistake;

            setFlashcards((prev) => {
                const updated = prev.map((c) => c.id === id ? { ...c, isMistake: newValue } : c);
                if (!user) saveToLocalStorage(updated);
                // Keshni ham yangilaymiz
                saveToSupabaseCache(updated);
                return updated;
            });

            // Supabase ga saqlaymiz (eslab qoladi)
            if (user) {
                try {
                    const { error } = await supabase
                        .from('flashcards')
                        .update({ is_mistake: newValue })
                        .eq('id', id)
                        .eq('user_id', user.id);

                    if (error) {
                        console.error('❌ Mistake saqlashda xatolik:', error);
                    }
                } catch (e) {
                    console.error('❌ Mistake saqlashda xatolik:', e);
                }
            }
        },
        [user, flashcards, saveToLocalStorage]
    );

    return {
        flashcards, loading, error, syncing, syncError,
        addFlashcards, addDemoCards, deleteFlashcard, deleteBatch,
        toggleMistake, syncLocalToSupabase, hasLocalData,
        refetch: loadFromSupabase,
    };
};

