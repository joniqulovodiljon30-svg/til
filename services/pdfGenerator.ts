
import { jsPDF } from "jspdf";
import { Flashcard } from "../types";

/**
 * Generates a production-grade, marginless A4 PDF.
 * Layout: 3x4 grid (12 cards per page).
 * Supports UNLIMITED pages (chunks of 12).
 */
export const generatePDF = (batches: { id: string; cards: Flashcard[] }[]) => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4" // 210mm x 297mm
  });

  // A4 Dimensions (Exact)
  const PAGE_WIDTH = 210;
  const PAGE_HEIGHT = 297;
  
  // Grid Dimensions (3 cols, 4 rows)
  const COLS = 3;
  const ROWS = 4;
  const CARDS_PER_PAGE = COLS * ROWS; // 12
  const CARD_WIDTH = PAGE_WIDTH / COLS;   // 70mm
  const CARD_HEIGHT = PAGE_HEIGHT / ROWS; // 74.25mm

  // Helper to draw a single card cell
  const drawCell = (
    x: number, 
    y: number, 
    content: { title: string; subtitle?: string; body?: string; footer?: string; isBack?: boolean },
    indexLabel: string
  ) => {
    // 1. Draw Cell Border (Cutting Guide)
    doc.setLineWidth(0.1);
    doc.setLineDashPattern([2, 2], 0);
    doc.setDrawColor(200, 200, 200); 
    doc.rect(x, y, CARD_WIDTH, CARD_HEIGHT);
    doc.setLineDashPattern([], 0); // Reset

    // 2. Index Label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(180, 180, 180);
    doc.text(indexLabel, x + 3, y + 4);

    // 3. Calculate Centering
    const centerX = x + (CARD_WIDTH / 2);
    const ptToMm = 0.3528;
    const lineHeightFactor = 1.15;

    if (content.isBack) {
       // --- BACK SIDE ---
       const titleSize = 14;
       const bodySize = 9;
       const footerSize = 8;
       const gap = 4;

       doc.setFont("helvetica", "bold");
       doc.setFontSize(titleSize);
       const titleLines = doc.splitTextToSize(content.title, CARD_WIDTH - 12);
       const titleH = titleLines.length * titleSize * ptToMm * lineHeightFactor;

       doc.setFont("helvetica", "normal");
       doc.setFontSize(bodySize);
       const bodyLines = content.body ? doc.splitTextToSize(content.body, CARD_WIDTH - 12) : [];
       const bodyH = bodyLines.length * bodySize * ptToMm * lineHeightFactor;

       doc.setFont("helvetica", "italic");
       doc.setFontSize(footerSize);
       const footerLines = content.footer ? doc.splitTextToSize(`"${content.footer}"`, CARD_WIDTH - 12) : [];
       const footerH = footerLines.length * footerSize * ptToMm * lineHeightFactor;

       const totalH = titleH + (bodyH > 0 ? gap + bodyH : 0) + (footerH > 0 ? gap + footerH : 0);
       const boxTopY = y + (CARD_HEIGHT - totalH) / 2;
       
       let cursor = boxTopY + (titleSize * ptToMm); 

       doc.setFont("helvetica", "bold");
       doc.setFontSize(titleSize);
       doc.setTextColor(0, 0, 0);
       doc.text(titleLines, centerX, cursor, { align: "center" });
       
       cursor += (titleLines.length * titleSize * ptToMm * lineHeightFactor);

       if (bodyLines.length > 0) {
         cursor += gap;
         doc.setFont("helvetica", "normal");
         doc.setFontSize(bodySize);
         doc.setTextColor(50, 50, 50);
         doc.text(bodyLines, centerX, cursor, { align: "center" });
         cursor += (bodyLines.length * bodySize * ptToMm * lineHeightFactor);
       }

       if (footerLines.length > 0) {
         cursor += gap;
         doc.setFont("helvetica", "italic");
         doc.setFontSize(footerSize);
         doc.setTextColor(100, 100, 100);
         doc.text(footerLines, centerX, cursor, { align: "center" });
       }

    } else {
       // --- FRONT SIDE ---
       const wordSize = 22;
       const ipaSize = 10;
       const gap = 3;

       doc.setFont("helvetica", "bold");
       doc.setFontSize(wordSize);
       const wordLines = doc.splitTextToSize(content.title, CARD_WIDTH - 8);
       const wordH = wordLines.length * wordSize * ptToMm * lineHeightFactor;

       doc.setFont("helvetica", "italic");
       doc.setFontSize(ipaSize);
       const ipaLines = content.subtitle ? doc.splitTextToSize(content.subtitle, CARD_WIDTH - 8) : [];
       const ipaH = ipaLines.length * ipaSize * ptToMm * lineHeightFactor;

       const totalH = wordH + (ipaH > 0 ? gap + ipaH : 0);
       const boxTopY = y + (CARD_HEIGHT - totalH) / 2;
       
       let cursor = boxTopY + (wordSize * ptToMm); 

       doc.setFont("helvetica", "bold");
       doc.setFontSize(wordSize);
       doc.setTextColor(0, 0, 0);
       doc.text(wordLines, centerX, cursor, { align: "center" });
       
       if (ipaLines.length > 0) {
         const wordBottom = boxTopY + wordH;
         const ipaTop = wordBottom + gap;
         const ipaBaseline = ipaTop + (ipaSize * ptToMm);
         
         doc.setFont("helvetica", "italic");
         doc.setFontSize(ipaSize);
         doc.setTextColor(100, 100, 100);
         doc.text(ipaLines, centerX, ipaBaseline, { align: "center" });
       }
    }
  };

  // --- MAIN GENERATION LOOP (UNLIMITED PAGES) ---
  
  let isFirstPage = true;

  batches.forEach((batch, batchIdx) => {
    const allCards = batch.cards;

    // Process in chunks of 12
    for (let i = 0; i < allCards.length; i += CARDS_PER_PAGE) {
      // 1. Prepare Chunk (Pad with empty cards if needed for back-mirroring)
      const chunkRaw = allCards.slice(i, i + CARDS_PER_PAGE);
      const chunk = [...chunkRaw];
      while (chunk.length < CARDS_PER_PAGE) {
        chunk.push({
          id: `empty-${Date.now()}-${chunk.length}`,
          word: '', ipa: '', translation: '', definition: '', example: '', batchId: '', createdAt: 0
        });
      }

      // Current Chunk Info for Labels
      const chunkIdx = Math.floor(i / CARDS_PER_PAGE);
      
      // 2. PAGE N (FRONT)
      // Only add new page if it's NOT the very first page of the document
      if (!isFirstPage) {
        doc.addPage();
      }
      isFirstPage = false; // Next iteration will always add page

      chunk.forEach((card, idx) => {
        const col = idx % COLS;
        const row = Math.floor(idx / COLS);
        const x = col * CARD_WIDTH;
        const y = row * CARD_HEIGHT;
        const label = `${batch.id} [${chunkIdx + 1}]-${idx + 1}`;

        if (card.word) {
          drawCell(x, y, {
            title: card.word,
            subtitle: card.ipa,
            isBack: false
          }, label);
        }
      });

      // 3. PAGE N+1 (BACK)
      doc.addPage(); // Always add a new page for the back side

      chunk.forEach((card, idx) => {
        // Mirror Logic for Duplex Printing
        // Front: 1 2 3
        // Back:  3 2 1
        const col = idx % COLS;
        const row = Math.floor(idx / COLS);
        const mirroredCol = (COLS - 1) - col; 
        
        const x = mirroredCol * CARD_WIDTH;
        const y = row * CARD_HEIGHT;
        const label = `${batch.id} [${chunkIdx + 1}]-${idx + 1} (Back)`;

        if (card.word) {
          drawCell(x, y, {
            title: card.translation,
            body: card.definition,
            footer: card.example,
            isBack: true
          }, label);
        }
      });
    }
  });

  // Filename Logic
  let filename = "flashcards.pdf";
  if (batches.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    filename = `flashcards_export_${today}.pdf`;
  }

  doc.save(filename);
};
