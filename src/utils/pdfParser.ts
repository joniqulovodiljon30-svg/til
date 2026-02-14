// PDF Parser - Fixed worker configuration
// Uses Vite's asset handling for PDF.js worker

import * as pdfjsLib from 'pdfjs-dist';
import { SupportedLanguage } from '../../types';

// CRITICAL FIX: Use CDN worker that matches installed version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface ParsedEntry {
    front: string;
    ipa: string;
    definition: string;
    example: string;
}

interface ParseResult {
    entries: ParsedEntry[];
    detectedLanguage: SupportedLanguage;
    errors: string[];
}

/**
 * Extract text from PDF using PDF.js
 */
async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
    try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        console.log(`📄 [PDF.js] Loaded PDF with ${pdf.numPages} pages`);

        let fullText = '';

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();

            // Extract text items with better spacing
            const pageText = textContent.items
                .map((item: any) => item.str)
                .join(' ')
                .replace(/\s+/g, ' '); // Normalize multiple spaces

            fullText += pageText + '\n';
        }

        console.log(`✅ [PDF.js] Extracted ${fullText.length} characters`);
        return fullText;

    } catch (error) {
        console.error('❌ [PDF.js] Extraction failed:', error);
        throw new Error(`PDF extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Check if line is a word entry (word /ipa/)
 */
function isWordLine(line: string): boolean {
    const wordPattern = /^[a-zA-Z][a-zA-Z\s\-']{0,50}\s*\/[^\/]+\//;
    return wordPattern.test(line.trim());
}

/**
 * Extract IPA from text
 */
function extractIPA(text: string): string | null {
    const ipaMatch = text.match(/\/([^\/]+)\//);
    return ipaMatch ? ipaMatch[1].trim() : null;
}

/**
 * Extract word from line (before IPA)
 */
function extractWord(line: string): string {
    const ipaStart = line.indexOf('/');
    if (ipaStart === -1) return line.trim();
    return line.substring(0, ipaStart).trim();
}



/**
 * Parse Cambridge Dictionary PDF
 */
export async function parsePDF(arrayBuffer: ArrayBuffer): Promise<ParseResult> {
    const errors: string[] = [];
    let entries: ParsedEntry[] = [];

    try {
        console.log(`🔍 [PDF Parser] Starting extraction (Unlimited Target)...`);

        // Extract text
        const fullText = await extractTextFromPDF(arrayBuffer);

        // Split into lines and clean
        const contentLines = fullText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        console.log(`📝 [PDF Parser] Processing ${contentLines.length} lines`);

        // CRITICAL FIX: Combine all text into one string (PDF squashes into massive lines)
        const combinedText = contentLines.join(' ').replace(/\s+/g, ' ');

        console.log(`📝 [PDF Parser] Combined text: ${combinedText.length} characters`);

        let successfulExtractions = 0;
        let ieltsExtractions = 0;

        // PRIORITY 1: Try Cambridge format (word /ipa/ definition)
        const cambridgeRegex = /\b([a-zA-Z][\w\-']+)\s+\/([^\/]+)\/\s*([^\/]*?)(?=\s+\b[a-zA-Z][\w\-']+\s+\/|$)/g;
        const cambridgeMatches = [...combinedText.matchAll(cambridgeRegex)];

        if (cambridgeMatches.length > 0) {
            console.log(`✅ [Cambridge Parser] Found ${cambridgeMatches.length} raw matches`);

            for (const match of cambridgeMatches) {
                const word = match[1].trim();
                const ipa = match[2].trim();
                const definition = match[3].trim();

                entries.push({
                    front: word,
                    ipa: `/${ipa}/`,
                    definition: definition || '', // May be empty, will be filled by AI
                    example: '', // Will be filled by AI
                });

                successfulExtractions++;
            }
        } else {
            // PRIORITY 2: Fallback to IELTS format (word: definition)
            console.log(`📘 [IELTS Parser] No Cambridge matches, trying IELTS format`);

            const ieltsRegex = /\b([a-zA-Z][\w\-']*)\s*:\s*([^:]+?)(?=\s+\b[a-zA-Z][\w\-']*\s*:|$)/g;
            const ieltsMatches = [...combinedText.matchAll(ieltsRegex)];

            console.log(`📘 [IELTS Parser] Found ${ieltsMatches.length} potential matches`);

            ieltsMatches.forEach((match) => {
                const word = match[1].trim();
                const definition = match[2].trim();

                // Validate word (single word, no spaces)
                if (!/^[a-zA-Z][\w\-']*$/.test(word)) {
                    return;
                }

                // Validate definition (substantial, no IPA slashes)
                if (definition.length < 5 || definition.includes('/')) {
                    return;
                }

                entries.push({
                    front: word,
                    ipa: '', // IELTS has no IPA, will be enriched
                    definition: definition,
                    example: '', // Will be enriched
                });

                ieltsExtractions++;

                if (ieltsExtractions <= 10) {
                    console.log(`📘 IELTS ${ieltsExtractions}: ${word}: ${definition.substring(0, 50)}...`);
                }
            });
        }

        console.log(`\n📊 [PDF Parser] SUMMARY:`);
        console.log(`   ✅ Cambridge extractions: ${successfulExtractions}`);
        console.log(`   📘 IELTS extractions: ${ieltsExtractions}`);
        console.log(`   📝 Total entries: ${entries.length}`);

        if (entries.length === 0) {
            throw new Error('No valid entries found in PDF. Ensure it follows Cambridge Dictionary format (word /ipa/).');
        }

        return {
            entries,
            detectedLanguage: 'en',
            errors,
        };

    } catch (error) {
        const errorMsg = `PDF parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error('❌ [PDF Parser]', errorMsg);
        errors.push(errorMsg);

        return {
            entries: [],
            detectedLanguage: 'en',
            errors,
        };
    }
}

// ============================================================================
// IELTS WORDLIST PARSER (ADDITIVE - NON-BREAKING)
// ============================================================================

/**
 * Check if line follows IELTS format: "word: definition"
 * SAFE: Does not interfere with Cambridge detection
 */
function isIELTSFormat(line: string): boolean {
    const trimmed = line.trim();

    // Must contain exactly one colon
    const colonCount = (trimmed.match(/:/g) || []).length;
    if (colonCount !== 1) return false;

    // Split by colon
    const parts = trimmed.split(':');
    if (parts.length !== 2) return false;

    const word = parts[0].trim();
    const definition = parts[1].trim();

    // Word must be a single word (no spaces, only letters/hyphens)
    if (!word || !/^[a-zA-Z][a-zA-Z\-']*$/.test(word)) return false;

    // Definition must exist and be substantial
    if (!definition || definition.length < 5) return false;

    // Must NOT match Cambridge format (no IPA slashes)
    if (trimmed.includes('/')) return false;

    return true;
}

/**
 * Parse a single IELTS format line
 * Format: "word: definition"
 * Returns normalized ParsedEntry structure
 */
function parseIELTSLine(line: string): ParsedEntry | null {
    try {
        const parts = line.trim().split(':');
        if (parts.length !== 2) return null;

        const word = parts[0].trim();
        const definition = parts[1].trim();

        return {
            front: word,
            ipa: '', // IELTS format has no IPA
            definition: definition,
            example: '', // IELTS format has no example
        };
    } catch (error) {
        console.error('❌ [IELTS Parser] Error parsing line:', error);
        return null;
    }
}

/**
 * Parse IELTS wordlist from text using GLOBAL REGEX
 * CRITICAL FIX: PDF text is squashed into massive lines, so we use matchAll()
 * instead of line-by-line parsing
 */
function parseIELTSWordlist(text: string): ParsedEntry[] {
    const entries: ParsedEntry[] = [];

    // Normalize text: join everything and normalize spaces
    const fullText = text.replace(/\s+/g, ' ').trim();

    console.log(`📘 [IELTS Parser] Processing ${fullText.length} characters`);

    // Global regex: word followed by colon, capture everything until next word:colon or end
    // Pattern: word : definition (lookahead for next word: or end of string)
    const ieltsRegex = /([a-zA-Z][\w\-']*)\s*:\s*([^:]+?)(?=\s+[a-zA-Z][\w\-']*\s*:|$)/g;

    const matches = [...fullText.matchAll(ieltsRegex)];

    console.log(`📘 [IELTS Parser] Found ${matches.length} potential matches`);

    for (const match of matches) {
        const word = match[1].trim();
        const definition = match[2].trim();

        // Validate word (single word, no spaces)
        if (!/^[a-zA-Z][\w\-']*$/.test(word)) {
            continue;
        }

        // Validate definition (substantial, no IPA slashes)
        if (definition.length < 5 || definition.includes('/')) {
            continue;
        }

        entries.push({
            front: word,
            ipa: '', // IELTS format has no IPA
            definition: definition,
            example: '', // IELTS format has no example
        });

        if (entries.length <= 10) {
            console.log(`📘 [IELTS] ${entries.length}. ${word}: ${definition.substring(0, 50)}...`);
        }
    }

    console.log(`📘 [IELTS Parser] Extracted ${entries.length} valid entries`);
    return entries;
}
