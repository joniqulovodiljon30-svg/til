import { useState, useCallback } from 'react';
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

interface UseSmartImportReturn {
    importing: boolean;
    error: string | null;
    progress: ProgressState;
    importFromPDF: (file: File, batchId: string, targetLanguage: SupportedLanguage) => Promise<void>;
    resetError: () => void;
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
 * Delay helper for rate limiting
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Translate a single word using MyMemory Free API
 */
async function translateWithMyMemory(word: string): Promise<string | null> {
    try {
        const response = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|uz`
        );

        if (!response.ok) return null;

        const data = await response.json();
        const translation = data.responseData?.translatedText;

        // Check if translation is valid (not the same as input, not empty)
        if (translation && translation.toLowerCase() !== word.toLowerCase()) {
            return translation;
        }

        return null;
    } catch (error) {
        console.warn(`[MyMemory] Failed to translate "${word}":`, error);
        return null;
    }
}

/**
 * Translate a batch of words using MyMemory API with parallel requests
 */
async function translateBatchWithMyMemory(
    words: string[],
    onProgress?: (current: number, total: number) => void
): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    const BATCH_SIZE = 10; // Process 10 words at a time
    const chunks = chunkArray(words, BATCH_SIZE);

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        // Process chunk in parallel
        const translations = await Promise.all(
            chunk.map(async (word) => {
                const translation = await translateWithMyMemory(word);
                return { word, translation };
            })
        );

        // Store successful translations
        translations.forEach(({ word, translation }) => {
            if (translation) {
                results.set(word.toLowerCase(), translation);
            }
        });

        if (onProgress) {
            onProgress((i + 1) * BATCH_SIZE, words.length);
        }

        // Small delay between batches
        if (i < chunks.length - 1) {
            await delay(200);
        }
    }

    return results;
}

/**
 * Translate a chunk using DeepSeek AI (fallback)
 */
async function translateChunkWithDeepSeek(words: string[], retryCount = 0): Promise<AITranslationResponse[]> {
    const prompt = `Translate ONLY the following words into Uzbek.

Rules:
- Translate ONLY the word meaning
- Use natural, dictionary-style Uzbek
- Verbs → verb form (infinitive)
- Nouns → noun form
- Keep it simple and learner-friendly
- Return STRICT JSON ONLY

Words: ${JSON.stringify(words)}

Output format (array of):
{
  "word": "original word",
  "meaning_uz": "uzbek translation"
}`;

    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${import.meta.env.VITE_DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a word translator. Translate ONLY the word meaning to Uzbek. Do NOT add definitions, examples, or IPA. Return valid JSON array only.'
                    },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
            }),
        });

        if (!response.ok) {
            throw new Error(`DeepSeek API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;

        // Remove markdown code blocks if present
        let cleanContent = content.trim();
        if (cleanContent.startsWith('```json')) {
            cleanContent = cleanContent.replace(/^```json\n/, '').replace(/\n```$/, '');
        } else if (cleanContent.startsWith('```')) {
            cleanContent = cleanContent.replace(/^```\n/, '').replace(/\n```$/, '');
        }

        const parsed = JSON.parse(cleanContent);

        if (Array.isArray(parsed)) {
            return parsed;
        }

        if (parsed.translations && Array.isArray(parsed.translations)) {
            return parsed.translations;
        }

        const values = Object.values(parsed);
        if (values.length > 0 && Array.isArray(values[0])) {
            return values[0] as AITranslationResponse[];
        }

        throw new Error('Invalid response structure');
    } catch (error) {
        // Retry once if failed
        if (retryCount < 1) {
            console.warn(`[DeepSeek] Chunk failed, retrying... (attempt ${retryCount + 1})`);
            await delay(1000);
            return translateChunkWithDeepSeek(words, retryCount + 1);
        }

        console.error('[DeepSeek] Translation chunk failed:', error);
        return [];
    }
}

/**
 * Enrich words with definitions and examples using DeepSeek AI
 */
async function enrichWordsWithDeepSeek(
    words: { word: string; ipa: string }[],
    onProgress?: (stage: string, percent: number) => void
): Promise<Map<string, { definition: string; example: string }>> {
    const results = new Map<string, { definition: string; example: string }>();
    const BATCH_SIZE = 10;
    const chunks = chunkArray(words, BATCH_SIZE);

    console.log(`🤖 [DeepSeek Enrichment] Processing ${words.length} words in ${chunks.length} batches`);

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const percent = 80 + ((i + 1) / chunks.length) * 15;

        if (onProgress) {
            onProgress(`AI enriching ${i + 1}/${chunks.length}`, percent);
        }

        try {
            const wordsJson = JSON.stringify(chunk.map(w => ({ word: w.word, ipa: w.ipa })));
            const prompt = `For each word, provide a CONCISE definition (max 15 words) and ONE example sentence.
Return ONLY valid JSON: [{"word": "example", "definition": "short definition", "example": "Example sentence."}]

Words: ${wordsJson}`;

            const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${import.meta.env.VITE_DEEPSEEK_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: 'You are a concise dictionary. Return only valid JSON.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.3,
                }),
            });

            if (!response.ok) {
                console.error(`[DeepSeek] Batch ${i + 1} failed`);
                continue;
            }

            const data = await response.json();
            let content = data.choices?.[0]?.message?.content || '[]';
            content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

            const enriched = JSON.parse(content);
            enriched.forEach((item: any) => {
                if (item.word && item.definition) {
                    results.set(item.word.toLowerCase(), {
                        definition: item.definition,
                        example: item.example || '',
                    });
                }
            });

            console.log(`✅ [DeepSeek] Batch ${i + 1}/${chunks.length} enriched`);
        } catch (error) {
            console.error(`❌ [DeepSeek] Batch ${i + 1} error:`, error);
        }

        if (i < chunks.length - 1) {
            await delay(1000);
        }
    }

    console.log(`📊 [DeepSeek Enrichment] Completed: ${results.size}/${words.length} words`);
    return results;
}

/**
 * HYBRID TRANSLATION STRATEGY
 * 1. Try MyMemory (free) for all words
 * 2. Use DeepSeek (paid) only for failed words
 */
async function translateToUzbek(
    words: string[],
    onProgress?: (stage: string, percent: number) => void
): Promise<AITranslationResponse[]> {
    console.log(`[Hybrid] Starting translation for ${words.length} words`);

    // STAGE 1: MyMemory Free API (0-50%)
    if (onProgress) onProgress('Translating with free API...', 10);

    const myMemoryResults = await translateBatchWithMyMemory(words, (current, total) => {
        const percent = 10 + (current / total) * 40;
        if (onProgress) onProgress(`Free API: ${current}/${total} words`, percent);
    });

    console.log(`[Hybrid] MyMemory translated: ${myMemoryResults.size}/${words.length} words`);

    // Find words that failed MyMemory translation
    const failedWords = words.filter(word => !myMemoryResults.has(word.toLowerCase()));

    if (onProgress) onProgress('Free translation complete', 50);

    // STAGE 2: DeepSeek AI Fallback (50-80%)
    let deepSeekResults: AITranslationResponse[] = [];

    if (failedWords.length > 0) {
        console.log(`[Hybrid] Using DeepSeek for ${failedWords.length} failed words`);

        if (onProgress) onProgress(`AI refinement for ${failedWords.length} words...`, 55);

        const CHUNK_SIZE = 20;
        const chunks = chunkArray(failedWords, CHUNK_SIZE);

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const translations = await translateChunkWithDeepSeek(chunk);
            deepSeekResults.push(...translations);

            const percent = 55 + ((i + 1) / chunks.length) * 25;
            if (onProgress) onProgress(`AI batch ${i + 1}/${chunks.length}`, percent);

            if (i < chunks.length - 1) {
                await delay(500);
            }
        }
    }

    if (onProgress) onProgress('Translation complete', 80);

    // Combine results
    const allTranslations: AITranslationResponse[] = [];

    // Add MyMemory results
    words.forEach(word => {
        const translation = myMemoryResults.get(word.toLowerCase());
        if (translation) {
            allTranslations.push({ word, meaning_uz: translation });
        }
    });

    // Add DeepSeek results
    allTranslations.push(...deepSeekResults);

    console.log(`[Hybrid] Total translated: ${allTranslations.length}/${words.length} words`);
    console.log(`[Hybrid] MyMemory: ${myMemoryResults.size}, DeepSeek: ${deepSeekResults.length}`);

    return allTranslations;
}

export const useSmartImport = (): UseSmartImportReturn => {
    const { user } = useAuth();
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<ProgressState>({ percent: 0, status: '' });

    const resetError = useCallback(() => {
        setError(null);
    }, []);

    const importFromPDF = useCallback(
        async (file: File, batchId: string, targetLanguage: SupportedLanguage) => {
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
                    throw new Error('No valid entries found in PDF. Ensure it follows Cambridge Dictionary format (word /ipa/ definition).');
                }

                setProgress({ percent: 40, status: `Found ${parseResult.entries.length} vocabulary entries` });

                console.log(`📝 [SmartImport] Detected language: ${parseResult.detectedLanguage}, Target: ${targetLanguage}`);

                // STAGE 3: Hybrid Translation (40-80%)
                const words = parseResult.entries.map(e => e.front);

                const translations = await translateToUzbek(words, (stage, percent) => {
                    setProgress({ percent: Math.round(percent), status: stage });
                });

                setProgress({ percent: 80, status: 'Preparing database entries...' });

                const translationMap = new Map(
                    translations.map(t => [t.word.toLowerCase(), t.meaning_uz])
                );

                // STAGE 3: Enrich with definitions and examples (80-95%)
                setProgress({ percent: 80, status: 'Enriching with AI...' });

                const wordsToEnrich = parseResult.entries.map(entry => ({
                    word: entry.front,
                    ipa: entry.ipa
                }));

                const enrichmentMap = await enrichWordsWithDeepSeek(wordsToEnrich, (stage, percent) => {
                    setProgress({ percent, status: stage });
                });

                console.log(`📊 [SmartImport] Enriched ${enrichmentMap.size}/${wordsToEnrich.length} words`);

                // STAGE 4: Save to database (95-100%)
                setProgress({ percent: 95, status: 'Saving to database...' });

                const finalBatchId = batchId === 'TODAY' ? getTodayBatchId() : batchId;

                const dbCards = parseResult.entries
                    .filter(entry => translationMap.has(entry.front.toLowerCase()))
                    .map(entry => {
                        const meaningUz = translationMap.get(entry.front.toLowerCase()) || '';
                        const enrichment = enrichmentMap.get(entry.front.toLowerCase());

                        return {
                            user_id: user.id,
                            front: entry.front,
                            back: meaningUz,
                            ipa: entry.ipa || '',
                            definition: enrichment?.definition || '',
                            example: enrichment?.example || '',
                            batch_id: finalBatchId,
                            category: targetLanguage,
                            audio: '',
                        };
                    });

                if (dbCards.length === 0) {
                    throw new Error('No cards to import after translation');
                }

                setProgress({ percent: 85, status: `Saving ${dbCards.length} cards to database...` });

                const { error: insertError } = await supabase
                    .from('flashcards')
                    .insert(dbCards);

                if (insertError) {
                    throw new Error(`Database error: ${insertError.message}`);
                }

                setProgress({ percent: 100, status: 'Import complete!' });

                setTimeout(() => {
                    setImporting(false);
                    setProgress({ percent: 0, status: '' });
                }, 1000);

            } catch (err) {
                console.error('[SmartImport] PDF import failed:', err);
                const errorMessage = err instanceof Error ? err.message : 'Import failed';
                setError(errorMessage);
                setImporting(false);
                setProgress({ percent: 0, status: '' });
            }
        },
        [user]
    );

    return {
        importing,
        error,
        progress,
        importFromPDF,
        resetError,
    };
};
