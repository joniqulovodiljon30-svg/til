// Dictionary API Service for enriched card data
// Uses free dictionaryapi.dev API

interface DictionaryResponse {
    word: string;
    phonetic?: string;
    phonetics?: Array<{
        text?: string;
        audio?: string;
    }>;
    meanings?: Array<{
        partOfSpeech: string;
        definitions: Array<{
            definition: string;
            example?: string;
        }>;
    }>;
}

interface EnrichedWordData {
    word: string;
    ipa: string;
    definition: string;
    example: string;
    audio: string;
}

export const fetchWordData = async (word: string): Promise<EnrichedWordData> => {
    try {
        const response = await fetch(
            `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.trim())}`
        );

        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }

        const data: DictionaryResponse[] = await response.json();

        if (!data || data.length === 0) {
            throw new Error('No data returned from API');
        }

        const entry = data[0];

        // Extract IPA
        let ipa = '';
        if (entry.phonetic) {
            ipa = entry.phonetic;
        } else if (entry.phonetics && entry.phonetics.length > 0) {
            ipa = entry.phonetics.find(p => p.text)?.text || '';
        }

        // Extract audio URL
        let audio = '';
        if (entry.phonetics && entry.phonetics.length > 0) {
            audio = entry.phonetics.find(p => p.audio)?.audio || '';
        }

        // Extract first noun or verb definition
        let definition = '';
        let example = '';

        if (entry.meanings && entry.meanings.length > 0) {
            // Prefer noun or verb
            const preferredMeaning = entry.meanings.find(
                m => m.partOfSpeech === 'noun' || m.partOfSpeech === 'verb'
            ) || entry.meanings[0];

            if (preferredMeaning.definitions && preferredMeaning.definitions.length > 0) {
                const def = preferredMeaning.definitions[0];
                definition = def.definition;
                example = def.example || '';
            }
        }

        return {
            word: entry.word,
            ipa: ipa || '',
            definition: definition || '',
            example: example || '',
            audio: audio || '',
        };
    } catch (error) {
        console.error('[DictionaryAPI] Error fetching word data:', error);

        // Return empty data on failure (graceful degradation)
        return {
            word: word,
            ipa: '',
            definition: '',
            example: '',
            audio: '',
        };
    }
};
