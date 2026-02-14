import { useState, useCallback, useEffect } from 'react';
import { parsePDF } from '../utils/pdfParser';
import { extractWords } from '../../services/vocabService';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { SupportedLanguage } from '../../types';

const STORAGE_KEY_QUEUE = 'smart_import_queue_v1';
const CHAPTER_SIZE = 50; // Process 50 words then save to DB
const API_DELAY = 300; // 300ms delay for performance
const RETRY_DELAY = 5000; // 5s wait for retries

interface ImportProgress {
    percent: number;
    status: string;
    processed: number;
    total: number;
}

export const useSmartImport = () => {
    const { user } = useAuth();
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<ImportProgress>({
        percent: 0,
        status: '',
        processed: 0,
        total: 0
    });

    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    const saveQueueState = (state: any) => {
        localStorage.setItem(STORAGE_KEY_QUEUE, JSON.stringify(state));
    };

    const getQueueState = () => {
        const saved = localStorage.getItem(STORAGE_KEY_QUEUE);
        return saved ? JSON.parse(saved) : null;
    };

    const clearQueue = () => {
        localStorage.removeItem(STORAGE_KEY_QUEUE);
        setError(null);
    };

    const processQueue = useCallback(async (resume = false) => {
        if (!user) return;

        const state = getQueueState();
        if (!state) return;

        setImporting(true);
        setError(null);

        try {
            const { entries, batchId, targetLanguage, processedCount } = state;
            const totalEntries = Math.min(entries.length, 200000); // Strict 200,000 limit
            const totalChapters = Math.ceil(totalEntries / CHAPTER_SIZE);

            let currentBatchEntries = [];

            // 1. Core Processing Loop
            for (let chapterIdx = Math.floor(processedCount / CHAPTER_SIZE); chapterIdx < totalChapters; chapterIdx++) {
                const chapterStart = chapterIdx * CHAPTER_SIZE;
                const chapterEnd = Math.min(chapterStart + CHAPTER_SIZE, totalEntries);
                const chapterItems = entries.slice(chapterStart, chapterEnd);
                const chapterWords = chapterItems.map(item => item.front);

                // --- PROGRESS FEEDBACK ---
                setProgress({
                    percent: Math.round((chapterStart / totalEntries) * 100),
                    status: `Processing Batch ${chapterIdx + 1} of ${totalChapters}...`,
                    processed: chapterStart,
                    total: totalEntries
                });

                let attempts = 0;
                let success = false;

                while (!success && attempts < 3) {
                    try {
                        // --- RATE LIMIT SAFETY (Per Batch) ---
                        await delay(API_DELAY);

                        // --- BATCH ENRICH DATA (AI Call) ---
                        const enrichedResults = await extractWords(chapterWords, targetLanguage);

                        // --- PROCESS & CLEAN RESULTS ---
                        const currentBatchEntries = enrichedResults.map(enriched => {
                            // Strip HTML and trim
                            const cleanTranslation = (enriched.translation || 'N/A')
                                .replace(/<[^>]*>?/gm, '')
                                .trim();

                            const cleanDefinition = (enriched.definition || '')
                                .replace(/<[^>]*>?/gm, '')
                                .trim();

                            const cleanExample = (enriched.example || '')
                                .replace(/<[^>]*>?/gm, '')
                                .trim();

                            // --- FORMAT BACK SIDE (Zealous Style) ---
                            // Template: Uzbek Translation\n\n(English Definition)
                            const backContent = cleanDefinition
                                ? `${cleanTranslation}\n\n(${cleanDefinition})`
                                : cleanTranslation;

                            return {
                                user_id: user.id,
                                front: enriched.word,
                                back: backContent,
                                ipa: enriched.ipa || '',
                                transcription: enriched.ipa || '',
                                definition: cleanDefinition,
                                example: cleanExample,
                                audio: enriched.audio || '',
                                batch_id: batchId,
                                category: targetLanguage,
                                created_at: new Date().toISOString()
                            };
                        }).filter(entry => entry.front.length > 1);

                        // --- SAVE CHAPTER TO DB ---
                        if (currentBatchEntries.length > 0) {
                            console.log(`💾 Saving batch ${chapterIdx + 1} of ${currentBatchEntries.length} cards...`);
                            const { error: insertError } = await supabase.from('flashcards').insert(currentBatchEntries);

                            if (insertError) {
                                console.error('❌ [Database Error] Failed to save batch:', insertError);
                                throw insertError; // Stop on DB failure to allow resume
                            }

                            // Update local state for resume persistence
                            saveQueueState({ ...state, processedCount: chapterEnd });
                            console.log(`✅ Processed batch ending at: ${chapterEnd}`);
                        }

                        success = true; // Mark batch as successful

                    } catch (batchError: any) {
                        attempts++;

                        // Check for 429 or 500 status
                        const isRetryable = batchError.status === 429 ||
                            batchError.status === 500 ||
                            batchError.message?.includes('429') ||
                            batchError.message?.includes('500');

                        if (isRetryable && attempts < 3) {
                            console.warn(`⚠️ [API Error] Status ${batchError.status || 'Unknown'}. Retrying in 5s... (Attempt ${attempts}/3)`);
                            await delay(RETRY_DELAY);
                            // Continue loop to retry
                        } else {
                            console.error(`❌ [Batch Error] Failed to process batch ${chapterIdx + 1}:`, batchError);
                            throw batchError;
                        }
                    }
                }
            }

            // 3. Final Completion
            console.log('✨ [Smart Import] SUCCESS: All chapters processed.');
            clearQueue();
            setImporting(false);

            // Only show success notification AFTER last word is saved
            alert(`Muvaffaqiyatli yakunlandi! ${totalEntries} so'z qo'shildi.`);
            window.location.reload(); // Refresh to see cards

        } catch (err: any) {
            console.error('❌ [Import Crash] FATAL ERROR:', err);
            setError(err.message || 'Import failed. You can resume from the last saved chapter.');
            setImporting(false);
        }
    }, [user]);

    const importFromPDF = useCallback(async (file: File, batchId: string, targetLanguage: SupportedLanguage) => {
        setImporting(true);
        setError(null);
        setProgress({ percent: 5, status: 'Reading PDF...', processed: 0, total: 0 });

        try {
            const arrayBuffer = await file.arrayBuffer();
            const result = await parsePDF(arrayBuffer);

            if (result.errors.length > 0 && result.entries.length === 0) {
                throw new Error(result.errors[0]);
            }

            // Format Batch ID: [Clean Filename] (YYYY-MM-DD)
            const cleanFileName = file.name.replace(/\.[^/.]+$/, "").replace(/\d+$/, "").trim();
            const dateStr = new Date().toISOString().split('T')[0];
            const finalBatchId = batchId === 'TODAY' ? `${cleanFileName} (${dateStr})` : batchId;

            const queueState = {
                entries: result.entries,
                batchId: finalBatchId,
                targetLanguage,
                processedCount: 0,
                total: result.entries.length
            };

            saveQueueState(queueState);
            await processQueue();

        } catch (err: any) {
            setError(err.message || 'Failed to read PDF');
            setImporting(false);
        }
    }, [processQueue]);

    const resumeImport = useCallback(async () => {
        await processQueue(true);
    }, [processQueue]);

    return {
        importing,
        error,
        progress,
        importFromPDF,
        resumeImport,
        hasUnfinishedImport: !!localStorage.getItem(STORAGE_KEY_QUEUE),
        resetError: () => setError(null),
        clearQueue
    };
};
