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
    const entries: ParsedEntry[] = [];

    try {
        console.log('🔍 [PDF Parser] Starting extraction...');

        // Extract text
        const fullText = await extractTextFromPDF(arrayBuffer);

        // Split into lines and clean
        const contentLines = fullText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        console.log(`📝 [PDF Parser] Processing ${contentLines.length} lines`);

        let i = 0;
        let successfulExtractions = 0;

        while (i < contentLines.length) {
            const currentLine = contentLines[i];

            if (isWordLine(currentLine)) {
                try {
                    const word = extractWord(currentLine);
                    const ipa = extractIPA(currentLine);

                    if (!ipa) {
                        i++;
                        continue;
                    }

                    // SIMPLIFIED: Only extract word and IPA
                    // AI will generate clean definition and example later
                    entries.push({
                        front: word,
                        ipa: `/${ipa}/`,
                        definition: '', // Will be filled by AI
                        example: '', // Will be filled by AI
                    });

                    successfulExtractions++;

                    if (successfulExtractions <= 10) {
                        console.log(`✅ Entry ${successfulExtractions}: ${word} /${ipa}/`);
                    }

                } catch (err) {
                    console.error(`❌ Error parsing line ${i}:`, err);
                }
            }

            i++;
        }

        console.log(`\n📊 [PDF Parser] SUMMARY:`);
        console.log(`   ✅ Successful extractions: ${successfulExtractions}`);
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
