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

            // 1. Core Processing Loop (Granular for UI Feedback)
            let tempBatch = [];

            for (let i = processedCount; i < totalEntries; i++) {
                const entry = entries[i];

                // --- GRANULAR PROGRESS (The 'Matrix' Effect) ---
                setProgress({
                    percent: Math.round((i / totalEntries) * 100),
                    status: `Translating: ${entry.front} (${i + 1}/${totalEntries})`,
                    processed: i,
                    total: totalEntries
                });

                let attempts = 0;
                let wordSuccess = false;

                while (!wordSuccess && attempts < 3) {
                    try {
                        // --- ENRICH DATA (AI Call) ---
                        const results = await extractWords([entry.front], targetLanguage);

                        if (results && results.length > 0) {
                            const enriched = results[0];

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

                            const backContent = cleanDefinition
                                ? `${cleanTranslation}\n\n(${cleanDefinition})`
                                : cleanTranslation;

                            tempBatch.push({
                                user_id: user.id,
                                front: enriched.word || entry.front,
                                back: backContent,
                                ipa: enriched.ipa || '',
                                transcription: enriched.ipa || '',
                                definition: cleanDefinition,
                                example: cleanExample,
                                audio: enriched.audio || '',
                                batch_id: batchId,
                                category: targetLanguage,
                                created_at: new Date().toISOString()
                            });
                        }

                        wordSuccess = true;

                    } catch (err: any) {
                        attempts++;
                        const isRetryable = err.status === 429 || err.status === 500 ||
                            err.message?.includes('429') || err.message?.includes('500');

                        if (isRetryable && attempts < 3) {
                            console.warn(`⚠️ [Retry] ${entry.front} failed. Waiting 5s...`);
                            await delay(RETRY_DELAY);
                        } else {
                            console.error(`❌ [Fatal Word Error] ${entry.front}:`, err);
                            // Avoid stopping the whole import for individual AI failures
                            wordSuccess = true;
                        }
                    }
                }

                // --- CONSTANT PACE DELAY ---
                await delay(API_DELAY);

                // --- BATCH SAVE (Safety & Performance with UPSERT) ---
                if (tempBatch.length >= CHAPTER_SIZE || i === totalEntries - 1) {
                    if (tempBatch.length > 0) {
                        console.log(`💾 Upserting batch of ${tempBatch.length} cards... (Progress: ${i + 1}/${totalEntries})`);

                        const { error: upsertError } = await supabase
                            .from('flashcards')
                            .upsert(tempBatch, {
                                onConflict: 'user_id, front, batch_id',
                                ignoreDuplicates: true
                            });

                        if (upsertError) {
                            if (upsertError.code === '23505') {
                                console.warn('⚠️ [Duplicate Warning] Skipping duplicates in batch...');
                                // Continue to next batch
                            } else {
                                console.error('❌ [Database Error] Failed to upsert batch:', upsertError);
                                throw upsertError;
                            }
                        }

                        tempBatch = []; // Clear for next batch
                        saveQueueState({ ...state, processedCount: i + 1 });
                    }
                }
            }

            // 3. Final Completion
            console.log('✨ [Smart Import] SUCCESS: All items processed.');
            clearQueue();
            setImporting(false);

            // Only show success notification AFTER last word is saved
            alert(`Muvaffaqiyatli yakunlandi! ${totalEntries} so'z qo'shildi.`);
            window.location.reload(); // Refresh to see cards

        } catch (err: any) {
            console.error('❌ [Import Crash] FATAL ERROR:', err);
            setError(err.message || 'Import failed. You can resume from the last saved state.');
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
