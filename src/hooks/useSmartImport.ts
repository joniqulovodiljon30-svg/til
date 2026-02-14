import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { SupportedLanguage } from '../../types';
import { parsePDF } from '../utils/pdfParser';

interface ParsedEntry {
    front: string;
    ipa: string;
    definition: string;
    example: string;
}

interface AITranslationResponse {
    word: string;
    meaning_uz: string;
}

interface ProgressState {
    percent: number;
    status: string;
}

interface ImportQueue {
    batchId: string;
    targetLanguage: SupportedLanguage;
    entries: any[];
    processedCount: number;
    timestamp: number;
}

interface UseSmartImportReturn {
    importing: boolean;
    error: string | null;
    progress: ProgressState;
    importFromPDF: (file: File, batchId: string, targetLanguage: SupportedLanguage) => Promise<void>;
    resumeImport: () => Promise<void>;
    hasUnfinishedImport: boolean;
    resetError: () => void;
    clearQueue: () => void;
}

const getTodayBatchId = (): string => {
    return new Date().toISOString().split('T')[0];
};

/**
 * Helper function to split array into chunks
 */
function chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

/**
 * Fetch with timeout helper
 */
async function fetchWithTimeout(resource: RequestInfo, options: RequestInit & { timeout?: number } = {}) {
    const { timeout = 3000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

/**
 * Delay helper for rate limiting
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Google Translate GTX Fallback: Fast and reliable translation
 */
async function fetchGoogleTranslation(word: string): Promise<string | null> {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=uz&dt=t&q=${encodeURIComponent(word)}`;
        const response = await fetchWithTimeout(url, { timeout: 5000 });
        if (!response.ok) {
            console.warn(`⚠️ [GoogleGTX] HTTP ${response.status} for "${word}"`);
            return null;
        }
        const data = await response.json();
        return data[0][0][0];
    } catch (error) {
        console.warn(`⚠️ [GoogleGTX] Network/CORS error for "${word}" (skipping)`);
        return null;
    }
}

/**
 * DictionaryAPI: Fetch IPA, Audio and Example sentence
 */
async function fetchDictionaryData(word: string): Promise<{ ipa?: string; audio?: string; example?: string } | null> {
    try {
        const response = await fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`, { timeout: 5000 });
        if (!response.ok) {
            if (response.status !== 404) {
                console.warn(`⚠️ [DictionaryAPI] HTTP ${response.status} for "${word}"`);
            }
            return null;
        }
        const data = await response.json();
        const entry = data[0];

        // 1. Get first valid IPA (phonetic)
        // Look for text phonetic first, then clean slashes
        let ipa = '';
        if (entry.phonetic) {
            ipa = entry.phonetic;
        } else if (entry.phonetics && entry.phonetics.length > 0) {
            const firstIPA = entry.phonetics.find((p: any) => p.text && p.text !== '');
            if (firstIPA) ipa = firstIPA.text;
        }

        // Ensure IPA is always wrapped in slashes if not empty
        if (ipa && !ipa.startsWith('/')) ipa = `/${ipa}`;
        if (ipa && !ipa.endsWith('/')) ipa = `${ipa}/`;

        // 2. Get first valid audio
        const audio = entry.phonetics?.find((p: any) => p.audio && p.audio !== '')?.audio;

        // 3. Get first valid example from any meaning
        let example = '';
        if (entry.meanings) {
            for (const meaning of entry.meanings) {
                if (meaning.definitions) {
                    for (const def of meaning.definitions) {
                        if (def.example) {
                            example = def.example;
                            break;
                        }
                    }
                }
                if (example) break;
            }
        }

        return { ipa, audio, example };
    } catch (error) {
        console.warn(`⚠️ [DictionaryAPI] Network/CORS error for "${word}" (skipping)`);
        return null;
    }
}

/**
 * Helper: Retry an async function once after 1s delay
 */
async function fetchWithRetry<T>(fn: () => Promise<T>, word: string, label: string): Promise<T | null> {
    try {
        return await fn();
    } catch (error) {
        console.warn(`⚠️ [${label} Retry] ${word} - Initial fail, retrying in 1s...`);
        await delay(1000);
        try {
            return await fn();
        } catch (retryError) {
            console.error(`❌ [${label} Fail] ${word} - Second fail, skipping.`);
            return null;
        }
    }
}



export const useSmartImport = (): UseSmartImportReturn => {
    const { user } = useAuth();
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<ProgressState>({ percent: 0, status: '' });
    const [hasUnfinishedImport, setHasUnfinishedImport] = useState(false);

    // Check for unfinished import on mount
    useEffect(() => {
        const queue = localStorage.getItem('import_queue');
        if (queue) {
            setHasUnfinishedImport(true);
        }
    }, []);

    // Warn before closing tab during import
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (importing) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [importing]);

    const resetError = useCallback(() => {
        setError(null);
    }, []);

    const clearQueue = useCallback(() => {
        localStorage.removeItem('import_queue');
        setHasUnfinishedImport(false);
    }, []);

    const processQueue = useCallback(
        async (
            queue: ImportQueue,
            onWordComplete?: () => void,
            onChapterComplete?: () => void
        ) => {
            if (!user) {
                setError('Please log in to import');
                return;
            }

            setImporting(true);
            setError(null);

            try {
                const { batchId, targetLanguage, entries, processedCount } = queue;
                const totalEntries = Math.min(entries.length, 200000); // Strict 200,000 limit
                const CHAPTER_SIZE = 50;
                const totalChapters = Math.ceil(totalEntries / CHAPTER_SIZE);

                console.log(`🚀 [Waterfall Pipeline] Processing ${totalEntries} words sequentially (starting from ${processedCount})`);

                let currentBatchEntries: any[] = [];

                // Process Chapter by Chapter
                for (let chapterIdx = Math.floor(processedCount / CHAPTER_SIZE); chapterIdx < totalChapters; chapterIdx++) {
                    const chapterStart = chapterIdx * CHAPTER_SIZE;
                    const chapterEnd = Math.min(chapterStart + CHAPTER_SIZE, totalEntries);
                    const chapterEntries = entries.slice(chapterStart, chapterEnd);

                    console.log(`📑 Processing Chapter ${chapterIdx + 1} of ${totalChapters} (${chapterStart + 1}-${chapterEnd})`);

                    // Sequential processing within chapter (one word at a time)
                    for (let i = 0; i < chapterEntries.length; i++) {
                        const entryIdx = chapterStart + i;
                        if (entryIdx < processedCount) continue; // Skip already processed

                        const entry = chapterEntries[i];
                        const word = entry.front;

                        // JUNK / NOISE FILTER (MANDATORY)
                        // Skip entry if front length <= 1 (e.g., "p", "•", "x")
                        if (word.length <= 1) {
                            console.log(`🧹 [SmartImport] Junk Filter: Skipping "${word}"`);
                            continue;
                        }

                        // Update UI granularly for each word
                        if (setProgress) {
                            setProgress({
                                percent: Math.round((entryIdx / totalEntries) * 100),
                                status: `Chapter ${chapterIdx + 1} of ${totalChapters}: Processing word "${word}"...`
                            });
                        }

                        // Step 1: Initialize from PDF (Foundation)
                        // entry.definition already contains PDF data

                        // Step 2: Sequential API Chain with Retry
                        const needsTrans = !entry.meaning_uz;
                        const needsDict = !entry.example || !entry.audio;

                        // A. Translation (Google GTX)
                        if (needsTrans) {
                            const googleRes = await fetchWithRetry(() => fetchGoogleTranslation(word), word, 'GoogleGTX');
                            if (googleRes) entry.meaning_uz = googleRes;
                        }

                        // B. Dictionary (IPA, Example, Audio)
                        if (needsDict) {
                            const dictRes = await fetchWithRetry(() => fetchDictionaryData(word), word, 'DictionaryAPI');
                            if (dictRes) {
                                if (dictRes.ipa && !entry.ipa) entry.ipa = dictRes.ipa;
                                if (dictRes.audio && !entry.audio) entry.audio = dictRes.audio;
                                if (dictRes.example && !entry.example) entry.example = dictRes.example;
                            }
                        }

                        // Step 3: Final Card Structure (STRICT CLEANUP)
                        // Stripping all HTML artifacts from Uzbek translation (MANDATORY)
                        const rawUzbek = entry.meaning_uz || 'Tarjima topilmadi';
                        const cleanUzbek = rawUzbek
                            .replace(/<[^>]*>?/gm, '') // Strip HTML tags
                            .replace(/Audio:.*$/i, '') // Remove "Audio:" labels
                            .replace(/https?:\/\/.*$/i, '') // Remove raw URLs
                            .trim();

                        const rawDef = entry.definition || 'No definition found';
                        const cleanDef = rawDef.replace(/<[^>]*>?/gm, '').trim();

                        // BACK FIELD FORMAT (EXACT): Uzbek Translation \n\n (English Definition)
                        // Rule: NO examples or audio URLs inside the back text.
                        entry.back = `${cleanUzbek}\n\n(${cleanDef})`;

                        currentBatchEntries.push(entry);

                        if (onWordComplete) onWordComplete();

                        // 600ms sequential waterfall delay (MANDATORY for stability)
                        await delay(600);
                    }

                    // Checkpoint: Save to DB after EACH chapter completion
                    if (currentBatchEntries.length > 0) {
                        console.log(`💾 Chapter ${chapterIdx + 1} complete. Saving ${currentBatchEntries.length} words to database...`);

                        const dbCards = currentBatchEntries.map(entry => {
                            // Final IPA check (from transcription or ipa field)
                            const finalIPA = (entry.ipa || entry.transcription || '').trim();

                            return {
                                user_id: user.id,
                                front: entry.front.trim(),
                                back: entry.back,
                                transcription: finalIPA, // Save to 'transcription' column as requested
                                definition: (entry.definition || '').replace(/<[^>]*>?/gm, '').trim(),
                                example: (entry.example || '').replace(/^Example:\s*/i, '').replace(/<[^>]*>?/gm, '').trim(),
                                batch_id: batchId,
                                category: targetLanguage as 'en' | 'es' | 'zh',
                                audio: entry.audio || '',
                                ipa: finalIPA, // Sync 'ipa' column too for safety
                            };
                        });

                        const { error: insertError } = await supabase.from('flashcards').insert(dbCards);
                        if (insertError) throw insertError;

                        // Trigger callback for UI refresh
                        if (onChapterComplete) onChapterComplete();

                        // Update storage
                        const nextProcessedCount = chapterEnd;
                        if (nextProcessedCount < totalEntries) {
                            localStorage.setItem('import_queue', JSON.stringify({
                                ...queue,
                                processedCount: nextProcessedCount
                            }));
                        } else {
                            localStorage.removeItem('import_queue');
                            setHasUnfinishedImport(false);
                        }

                        currentBatchEntries = []; // Clear for next chapter
                    }
                }

                setProgress({ percent: 100, status: `Done! ${totalEntries} words imported.` });
                setTimeout(() => setProgress({ percent: 0, status: '' }), 3000);

            } catch (err) {
                console.error('❌ [SmartImport] Process failed:', err);
                setError(err instanceof Error ? err.message : 'Import failed');
                throw err;
            } finally {
                setImporting(false);
            }
        },
        [user, setImporting, setError, setProgress, setHasUnfinishedImport]
    );

    const resumeImport = useCallback(async (onChapterComplete?: () => void) => {
        const queueStr = localStorage.getItem('import_queue');
        if (!queueStr) return;

        try {
            const queue: ImportQueue = JSON.parse(queueStr);
            setHasUnfinishedImport(true);
            await processQueue(queue, undefined, onChapterComplete);
        } catch (err) {
            console.error('Failed to resume import:', err);
            localStorage.removeItem('import_queue');
            setHasUnfinishedImport(false);
        }
    }, [user, processQueue]);

    const importFromPDF = useCallback(
        async (file: File, batchId: string, targetLanguage: SupportedLanguage, onChapterComplete?: () => void) => {
            if (!user) {
                setError('Please log in to import');
                return;
            }

            setImporting(true);
            setError(null);
            setProgress({ percent: 0, status: 'Starting import...' });

            try {
                // STAGE 1: Reading PDF (0-10%)
                setProgress({ percent: 5, status: 'Reading PDF file...' });
                const arrayBuffer = await file.arrayBuffer();

                // STAGE 2: Extracting Text (10-40%)
                setProgress({ percent: 15, status: 'Extracting text from PDF...' });
                const parseResult = await parsePDF(arrayBuffer);

                if (parseResult.errors.length > 0) {
                    console.warn('[SmartImport] Parse warnings:', parseResult.errors);
                }

                if (parseResult.entries.length === 0) {
                    throw new Error('No valid entries found in PDF. Ensure it follows Cambridge Dictionary format.');
                }

                const dateStr = new Date().toISOString().split('T')[0];
                const baseName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
                // Remove trailing numeric strings like -44-183-99
                const cleanFileName = baseName.replace(/[-\s\d]{3,}$/, "").trim();
                const finalBatchId = `${cleanFileName} (${dateStr})`;

                // SAVE TO LOCAL STORAGE IMMEDIATELY
                const queue: ImportQueue = {
                    batchId: finalBatchId,
                    targetLanguage,
                    entries: parseResult.entries,
                    processedCount: 0,
                    timestamp: Date.now()
                };
                localStorage.setItem('import_queue', JSON.stringify(queue));
                setHasUnfinishedImport(true);

                await processQueue(queue, undefined, onChapterComplete);

            } catch (err) {
                console.error('❌ [SmartImport] Import failed:', err);
                setError(err instanceof Error ? err.message : 'Import failed');
            } finally {
                setImporting(false);
            }
        },
        [user, processQueue]
    );

    return {
        importing,
        error,
        progress,
        importFromPDF,
        resumeImport,
        hasUnfinishedImport,
        resetError,
        clearQueue,
    };
}

