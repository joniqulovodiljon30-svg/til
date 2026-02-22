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
            const totalEntries = Math.min(entries.length, 200000);
            const totalBatches = Math.ceil(totalEntries / CHAPTER_SIZE);

            // 1. Outer Loop: Iterate through Batches (Chunks of 50)
            for (let batchIdx = Math.floor(processedCount / CHAPTER_SIZE); batchIdx < totalBatches; batchIdx++) {
                const batchStart = batchIdx * CHAPTER_SIZE;
                const batchEnd = Math.min(batchStart + CHAPTER_SIZE, totalEntries);
                const batchItems = entries.slice(batchStart, batchEnd);
                let currentBatchEntries = [];

                // 2. Inner Loop: Word-by-word UI updates
                for (let wordIdxInBatch = 0; wordIdxInBatch < batchItems.length; wordIdxInBatch++) {
                    const entry = batchItems[wordIdxInBatch];
                    const globalIdx = batchStart + wordIdxInBatch;

                    // --- DETAILED UI FEEDBACK ---
                    setProgress({
                        percent: Math.round((globalIdx / totalEntries) * 100),
                        status: `Batch ${batchIdx + 1}/${totalBatches}: Translating '${entry.front}' (${wordIdxInBatch + 1}/50)`,
                        processed: globalIdx,
                        total: totalEntries
                    });

                    let attempts = 0;
                    let wordSuccess = false;

                    while (!wordSuccess && attempts < 3) {
                        try {
                            const results = await extractWords([entry.front], targetLanguage);

                            if (results && results.length > 0) {
                                const enriched = results[0];

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

                                currentBatchEntries.push({
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
                                console.error(`❌ [Word Error] ${entry.front}:`, err);
                                wordSuccess = true;
                            }
                        }
                    }

                    // --- PACING DELAY ---
                    await delay(API_DELAY);
                }

                // 3. Batch Save (Safety & Performance with UPSERT)
                if (currentBatchEntries.length > 0) {
                    console.log(`💾 Upserting batch ${batchIdx + 1}/${totalBatches}...`);

                    const { error: insertError } = await supabase
                        .from('flashcards')
                        .insert(currentBatchEntries);

                    if (insertError) {
                        if (insertError.code === '23505') {
                            console.warn('⚠️ [Duplicate Warning] Ba\'zi dublikatlar o\'tkazib yuborildi...');
                        } else {
                            console.error('❌ [Database Error] Failed to insert batch:', insertError);
                            throw insertError;
                        }
                    }

                    // Only update persistence after batch success
                    saveQueueState({ ...state, processedCount: batchEnd });
                }
            }

            // 4. Final Completion
            console.log('✨ [Smart Import] SUCCESS: All items processed.');
            clearQueue();
            setImporting(false);

            alert(`Muvaffaqiyatli yakunlandi! ${totalEntries} so'z qo'shildi.`);
            window.location.reload();

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
