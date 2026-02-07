
import { jsPDF } from "jspdf";
import { Flashcard } from "../types";

// Helper: Convert buffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

const FONTS = {
  // Noto Sans (Latin/European)
  standard: {
    name: "NotoSans",
    url: "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf"
  },
  // Noto Sans SC (Simplified Chinese) - Using a reliable CDN
  chinese: {
    name: "NotoSansSC",
    url: "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-400-normal.ttf"
  }
};

export const generatePDF = async (batches: { id: string; cards: Flashcard[] }[]) => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  // Track loaded fonts to avoid re-fetching
  const loadedFonts = new Set<string>();

  const loadFont = async (key: 'standard' | 'chinese') => {
    if (loadedFonts.has(key)) return;
    try {
      console.log(`Fetching font: ${key}...`);
      const response = await fetch(FONTS[key].url);
      if (!response.ok) throw new Error(`Font fetch failed: ${response.status}`);
      const buffer = await response.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      
      const fileName = `${FONTS[key].name}.ttf`;
      doc.addFileToVFS(fileName, base64);
      doc.addFont(fileName, FONTS[key].name, "normal");
      loadedFonts.add(key);
      console.log(`Font ${key} loaded.`);
    } catch (e) {
      console.error(`Error loading font ${key}:`, e);
      // Fallback handled by using 'helvetica' if font not set
    }
  };

  // 1. Analyze Fonts Needed
  let needsChinese = false;
  let needsStandard = false;
  
  batches.forEach(b => {
    b.cards.forEach(c => {
      if (c.language === 'zh') needsChinese = true;
      else needsStandard = true;
    });
  });

  // 2. Load Fonts
  await loadFont('standard'); // Always load for UI/Fallbacks
  if (needsChinese) await loadFont('chinese');

  // 3. Draw Content
  const PAGE_WIDTH = 210;
  const PAGE_HEIGHT = 297;
  const COLS = 3;
  const ROWS = 4;
  const CARDS_PER_PAGE = 12;
  const CARD_WIDTH = PAGE_WIDTH / COLS;
  const CARD_HEIGHT = PAGE_HEIGHT / ROWS;

  let isFirstPage = true;

  // Render Loop
  batches.forEach((batch, batchIdx) => {
    const cards = batch.cards;
    
    for (let i = 0; i < cards.length; i += CARDS_PER_PAGE) {
      // Chunking
      const chunk = cards.slice(i, i + CARDS_PER_PAGE);
      // Fill empty slots
      while (chunk.length < CARDS_PER_PAGE) {
        chunk.push({ id: '', word: '', ipa: '', translation: '', definition: '', example: '', batchId: '', language: 'en', createdAt: 0 });
      }

      // Front Page
      if (!isFirstPage) doc.addPage();
      isFirstPage = false;

      chunk.forEach((card, idx) => {
        if (!card.word) return;
        const x = (idx % COLS) * CARD_WIDTH;
        const y = Math.floor(idx / COLS) * CARD_HEIGHT;
        const fontToUse = (card.language === 'zh' && loadedFonts.has('chinese')) ? FONTS.chinese.name : (loadedFonts.has('standard') ? FONTS.standard.name : "helvetica");
        
        drawFront(doc, x, y, card, fontToUse, CARD_WIDTH, CARD_HEIGHT, batch.id, idx + 1);
      });

      // Back Page
      doc.addPage();
      chunk.forEach((card, idx) => {
        if (!card.word) return;
        // Mirror position
        const col = idx % COLS;
        const row = Math.floor(idx / COLS);
        const mirroredCol = (COLS - 1) - col;
        const x = mirroredCol * CARD_WIDTH;
        const y = row * CARD_HEIGHT;
        
        // Back usually contains Uzbek (Standard Font) + Target Lang defs
        // We use Standard for Uzbek titles, and Target font for defs if needed.
        // For simplicity, we assume Noto Sans SC covers Latin well enough or we switch.
        const fontToUse = (card.language === 'zh' && loadedFonts.has('chinese')) ? FONTS.chinese.name : (loadedFonts.has('standard') ? FONTS.standard.name : "helvetica");

        drawBack(doc, x, y, card, fontToUse, CARD_WIDTH, CARD_HEIGHT, batch.id, idx + 1);
      });
    }
  });

  doc.save(`flashcards_multilang_${Date.now()}.pdf`);
};

// --- DRAWING HELPERS ---

function drawFront(doc: jsPDF, x: number, y: number, card: Flashcard, font: string, w: number, h: number, batchId: string, idx: number) {
  // Border
  doc.setDrawColor(200);
  doc.setLineWidth(0.1);
  doc.setLineDashPattern([2, 2], 0);
  doc.rect(x, y, w, h);
  doc.setLineDashPattern([], 0);

  // Label
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(150);
  doc.text(`${batchId} #${idx}`, x + 2, y + 4);

  // Content
  doc.setFont(font, "normal");
  const cx = x + w / 2;
  const cy = y + h / 2;
  
  // Word
  doc.setFontSize(22);
  doc.setTextColor(0);
  const wordLines = doc.splitTextToSize(card.word, w - 10);
  doc.text(wordLines, cx, cy - 5, { align: "center" });

  // IPA
  if (card.ipa) {
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`[${card.ipa}]`, cx, cy + 10, { align: "center" });
  }
}

function drawBack(doc: jsPDF, x: number, y: number, card: Flashcard, font: string, w: number, h: number, batchId: string, idx: number) {
  doc.setDrawColor(200);
  doc.setLineWidth(0.1);
  doc.setLineDashPattern([2, 2], 0);
  doc.rect(x, y, w, h);
  doc.setLineDashPattern([], 0);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(150);
  doc.text(`${batchId} #${idx} (Back)`, x + 2, y + 4);

  doc.setFont(font, "normal");
  const cx = x + w / 2;
  
  // Translation (Uzbek)
  let cursor = y + 20;
  doc.setFontSize(14);
  doc.setTextColor(0);
  const transLines = doc.splitTextToSize(card.translation, w - 10);
  doc.text(transLines, cx, cursor, { align: "center" });
  cursor += (transLines.length * 5) + 5;

  // Definition
  doc.setFontSize(9);
  doc.setTextColor(50);
  const defLines = doc.splitTextToSize(card.definition, w - 10);
  doc.text(defLines, cx, cursor, { align: "center" });
  cursor += (defLines.length * 4) + 5;

  // Example
  doc.setFontSize(8);
  doc.setTextColor(100);
  const exLines = doc.splitTextToSize(`"${card.example}"`, w - 10);
  doc.text(exLines, cx, cursor, { align: "center" });
}
