import { useState, useEffect, useCallback, useRef } from 'react';
import { Flashcard, SupportedLanguage } from '../../types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const STORAGE_KEY = 'vocab_pro_flashcards_v1';

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

// Get today's date in YYYY-MM-DD format for batch_id
const getTodayBatchId = (): string => {
    return new Date().toISOString().split('T')[0]; // "2026-02-12"
};

// STRICT DEMO DATA - One card per language
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
            console.error('[useFlashcards] Failed to load from localStorage:', e);
            return [];
        }
    }, []);

    const saveToLocalStorage = useCallback((cards: Flashcard[]) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
        } catch (e) {
            console.error('[useFlashcards] Failed to save to localStorage:', e);
        }
    }, []);

    const loadFromSupabase = useCallback(async () => {
        if (!user) {
            console.log('[useFlashcards] No user, skipping Supabase load');
            return;
        }

        try {
            console.log('[useFlashcards] Loading flashcards for user:', user.id);
            setLoading(true);
            setError(null);

            const { data, error: fetchError } = await (supabase
                .from('flashcards')
                .select('id, front, back, ipa, transcription, definition, example, category, batch_id, created_at, is_mistake, audio, user_id')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(200000) as any); // Set strict 200,000 limit

            if (fetchError) {
                console.error('[useFlashcards] Fetch error:', fetchError.message);
                throw fetchError;
            }

            console.log('[useFlashcards] Loaded', data?.length || 0, 'flashcards');

            const cards: Flashcard[] = (data || []).map((row) => ({
                id: row.id,
                word: row.front,
                ipa: row.ipa || '',
                transcription: (row as any).transcription || row.ipa || '', // Map transcription, fallback to ipa
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
        } catch (e) {
            console.error('[useFlashcards] Error loading from Supabase:', e);
            setError('Failed to load flashcards');
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (user) {
            console.log('[useFlashcards] User authenticated, loading from Supabase');
            loadFromSupabase();

            // REAL-TIME SUBSCRIPTION
            console.log('[useFlashcards] Setting up Real-time subscription for', user.id);
            const channel = supabase
                .channel(`public:flashcards:user:${user.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'flashcards',
                        filter: `user_id=eq.${user.id}`,
                    },
                    (payload) => {
                        console.log('[useFlashcards] Real-time change detected:', payload.eventType);
                        loadFromSupabase(); // Refetch on any change for simplicity/data integrity
                    }
                )
                .subscribe();

            return () => {
                console.log('[useFlashcards] Cleaning up Real-time subscription');
                supabase.removeChannel(channel);
            };
        } else {
            console.log('[useFlashcards] Guest mode, loading from localStorage');
            const localCards = loadFromLocalStorage();
            setFlashcards(localCards);
            setLoading(false);
        }
    }, [user, loadFromSupabase, loadFromLocalStorage]);

    const addDemoCards = useCallback(
        async (language: SupportedLanguage) => {
            console.log('[useFlashcards] Adding demo card for language:', language);

            // STRICT LANGUAGE ISOLATION - Use switch statement
            let demoData;
            switch (language) {
                case 'en':
                    demoData = DEMO_CARDS.en;
                    break;
                case 'es':
                    demoData = DEMO_CARDS.es;
                    break;
                case 'zh':
                    demoData = DEMO_CARDS.zh;
                    break;
                default:
                    console.warn('[useFlashcards] Invalid language:', language);
                    return;
            }

            // Check if demo already exists for this language
            const normalizedWord = normalizeWord(demoData.word);
            const demoExists = flashcards.some((card) => {
                const normalizedExisting = normalizeWord(card.word);
                return normalizedExisting === normalizedWord && card.language === language;
            });

            if (demoExists) {
                alert(`Demo flashcard already added for ${language.toUpperCase()}`);
                return;
            }

            const todayBatch = getTodayBatchId();
            const demoBatchId = `DEMO-${language.toUpperCase()}-${todayBatch}`;

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

            console.log('[useFlashcards] Successfully added demo card for', language);
        },
        [flashcards]
    );

    const syncLocalToSupabase = useCallback(async (): Promise<{
        success: boolean;
        error?: string;
    }> => {
        if (!user) {
            const errorMsg = 'User not authenticated. Please log in first.';
            console.error('[useFlashcards] Sync failed:', errorMsg);
            return { success: false, error: errorMsg };
        }

        console.log('[useFlashcards] Starting sync for user:', user.id);

        if (syncTriggeredRef.current === user.id) {
            console.log('[useFlashcards] Sync already completed for this session');
            return { success: true };
        }

        try {
            setSyncing(true);
            setSyncError(null);

            const localCards = loadFromLocalStorage();
            console.log('[useFlashcards] Found', localCards.length, 'local cards');

            if (localCards.length === 0) {
                console.log('[useFlashcards] No local cards to sync');
                setSyncing(false);
                return { success: true };
            }

            const { data: existingCards, error: fetchError } = await supabase
                .from('flashcards')
                .select('front, category, user_id')
                .eq('user_id', user.id)
                .range(0, 5000);

            if (fetchError) {
                console.error('[useFlashcards] Fetch error:', fetchError.message);
                throw new Error(`Failed to fetch existing cards: ${fetchError.message}`);
            }

            const existingPairs = new Set(
                (existingCards || []).map((card) =>
                    `${normalizeWord(card.front)}::${card.category}`
                )
            );

            const newCards = localCards.filter((card) => {
                const normalizedPair = `${normalizeWord(card.word)}::${card.language}`;
                return !existingPairs.has(normalizedPair);
            });

            console.log('[useFlashcards]', newCards.length, 'new cards to upload');

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

                const { error: insertError } = await supabase
                    .from('flashcards')
                    .insert(dbCards);

                if (insertError) {
                    console.error('[useFlashcards] Insert error:', insertError.message);
                    throw new Error(`Failed to insert cards: ${insertError.message}`);
                }

                console.log('[useFlashcards] Successfully inserted', dbCards.length, 'cards');
            }

            localStorage.removeItem(STORAGE_KEY);
            await loadFromSupabase();

            syncTriggeredRef.current = user.id;
            setSyncing(false);

            console.log('[useFlashcards] Sync completed successfully!');
            return { success: true };
        } catch (e) {
            console.error('[useFlashcards] Sync error:', e);
            const errorMsg = e instanceof Error ? e.message : 'Failed to sync data';
            setSyncError(errorMsg);
            setSyncing(false);
            return { success: false, error: errorMsg };
        }
    }, [user, loadFromLocalStorage, loadFromSupabase]);

    const addFlashcards = useCallback(
        async (cards: Flashcard[]) => {
            // Duplicate check
            for (const newCard of cards) {
                const normalizedNewWord = normalizeWord(newCard.word);

                const isDuplicate = flashcards.some((existingCard) => {
                    const normalizedExisting = normalizeWord(existingCard.word);
                    return normalizedExisting === normalizedNewWord &&
                        existingCard.language === newCard.language;
                });

                if (isDuplicate) {
                    alert(`This word is already in the ${newCard.language.toUpperCase()} collection!\n\nWord: "${newCard.word}"`);
                    return;
                }
            }

            if (user) {
                try {
                    console.log('[useFlashcards] Adding', cards.length, 'cards to Supabase');

                    // SCHEMA MATCH: Ensure object matches ALL database columns
                    const dbCards = cards.map((card) => ({
                        user_id: user.id,
                        front: card.word.trim(),
                        back: card.translation,
                        category: card.language,
                        audio: card.audio || '',
                        ipa: card.ipa || '',
                        definition: card.definition || '',
                        example: card.example || '',
                        batch_id: card.batchId || getTodayBatchId(),
                        language: card.language,
                    }));

                    const { error: insertError } = await supabase
                        .from('flashcards')
                        .insert(dbCards);

                    if (insertError) {
                        console.error('[useFlashcards] Add cards error:', insertError.message);

                        if (insertError.message.includes('duplicate key')) {
                            alert('This word already exists in this collection!');
                        } else {
                            throw insertError;
                        }
                        return;
                    }

                    console.log('[useFlashcards] Cards added successfully');

                    await loadFromSupabase();
                } catch (e) {
                    console.error('[useFlashcards] Error adding flashcards:', e);
                    setError('Failed to add flashcards');
                }
            } else {
                console.log('[useFlashcards] Adding', cards.length, 'cards to localStorage');
                setFlashcards((prev) => {
                    const updated = [...cards, ...prev];
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
                    const { error: deleteError } = await supabase
                        .from('flashcards')
                        .delete()
                        .eq('id', id)
                        .eq('user_id', user.id);

                    if (deleteError) throw deleteError;

                    setFlashcards((prev) => prev.filter((c) => c.id !== id));
                } catch (e) {
                    console.error('[useFlashcards] Error deleting flashcard:', e);
                    setError('Failed to delete flashcard');
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
                    const { error: deleteError } = await supabase
                        .from('flashcards')
                        .delete()
                        .eq('batch_id', batchId)
                        .eq('user_id', user.id);

                    if (deleteError) throw deleteError;

                    setFlashcards((prev) => prev.filter((c) => c.batchId !== batchId));
                } catch (e) {
                    console.error('[useFlashcards] Error deleting batch:', e);
                    setError('Failed to delete batch');
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
            if (user) {
                setFlashcards((prev) =>
                    prev.map((c) => (c.id === id ? { ...c, isMistake: !c.isMistake } : c))
                );
            } else {
                setFlashcards((prev) => {
                    const updated = prev.map((c) =>
                        c.id === id ? { ...c, isMistake: !c.isMistake } : c
                    );
                    saveToLocalStorage(updated);
                    return updated;
                });
            }
        },
        [user, flashcards, loadFromSupabase, saveToLocalStorage]
    );

    return {
        flashcards,
        loading,
        error,
        syncing,
        syncError,
        addFlashcards,
        addDemoCards,
        deleteFlashcard,
        deleteBatch,
        toggleMistake,
        syncLocalToSupabase,
        hasLocalData,
        refetch: loadFromSupabase,
    };
};
