
import { jsPDF } from "jspdf";
import { Flashcard } from "../types";

/**
 * Generates a production-grade, marginless A4 PDF.
 * Layout: 3x4 grid, zero margins, print-ready.
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
  const CARD_WIDTH = PAGE_WIDTH / COLS;   // 70mm
  const CARD_HEIGHT = PAGE_HEIGHT / ROWS; // 74.25mm

  // Helper to draw a single card cell
  const drawCell = (
    x: number, 
    y: number, 
    content: { title: string; subtitle?: string; body?: string; footer?: string; isBack?: boolean },
    indexLabel: string
  ) => {
    // 1. Draw Cell Border (Cutting Guide) - Very light gray dashed
    doc.setLineWidth(0.1);
    doc.setLineDashPattern([2, 2], 0);
    doc.setDrawColor(200, 200, 200); 
    doc.rect(x, y, CARD_WIDTH, CARD_HEIGHT);
    doc.setLineDashPattern([], 0); // Reset

    // 2. Draw Index Label (Top Left Corner)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(180, 180, 180); // Light gray
    doc.text(indexLabel, x + 3, y + 4); // 3mm padding from left, 4mm from top

    // 3. Calculate Centering
    const centerX = x + (CARD_WIDTH / 2);
    
    // Measurements for vertical centering
    const ptToMm = 0.3528;
    const lineHeightFactor = 1.15; // Standard jsPDF line height

    if (content.isBack) {
       // --- BACK SIDE: Translation, Definition, Example ---
       
       const titleSize = 14;
       const bodySize = 9;
       const footerSize = 8;
       const gap = 4; // mm between blocks

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

       // Total Content Height
       const totalH = titleH + (bodyH > 0 ? gap + bodyH : 0) + (footerH > 0 ? gap + footerH : 0);
       
       // Start Y Position (Vertically Centered)
       // Start drawing from the top of the calculated content box
       const boxTopY = y + (CARD_HEIGHT - totalH) / 2;
       
       let cursor = boxTopY + (titleSize * ptToMm); 

       // Draw Title (Translation)
       doc.setFont("helvetica", "bold");
       doc.setFontSize(titleSize);
       doc.setTextColor(0, 0, 0);
       doc.text(titleLines, centerX, cursor, { align: "center" });
       
       // Move cursor to bottom of title block
       cursor += (titleLines.length * titleSize * ptToMm * lineHeightFactor); // approximate block height

       // Draw Body (Definition)
       if (bodyLines.length > 0) {
         cursor += gap; // Add gap
         
         doc.setFont("helvetica", "normal");
         doc.setFontSize(bodySize);
         doc.setTextColor(50, 50, 50);
         // The y argument in doc.text is the baseline of the first line.
         doc.text(bodyLines, centerX, cursor, { align: "center" });
         
         cursor += (bodyLines.length * bodySize * ptToMm * lineHeightFactor);
       }

       // Draw Footer (Example)
       if (footerLines.length > 0) {
         cursor += gap;
         doc.setFont("helvetica", "italic");
         doc.setFontSize(footerSize);
         doc.setTextColor(100, 100, 100);
         doc.text(footerLines, centerX, cursor, { align: "center" });
       }

    } else {
       // --- FRONT SIDE: Word, IPA ---
       
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
       
       // Word Baseline
       let cursor = boxTopY + (wordSize * ptToMm); 

       doc.setFont("helvetica", "bold");
       doc.setFontSize(wordSize);
       doc.setTextColor(0, 0, 0);
       doc.text(wordLines, centerX, cursor, { align: "center" });
       
       if (ipaLines.length > 0) {
         // Move cursor down
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

  // --- GENERATION LOOP ---

  batches.forEach((batch, batchIdx) => {
    // Fill to 12
    const filledCards = [...batch.cards];
    while (filledCards.length < 12) {
      filledCards.push({
        id: `empty-${Date.now()}-${filledCards.length}`,
        word: '', ipa: '', translation: '', definition: '', example: '', batchId: '', createdAt: 0
      });
    }
    const cardsToPrint = filledCards.slice(0, 12);

    // PAGE 1: FRONT
    if (batchIdx > 0) doc.addPage();
    
    cardsToPrint.forEach((card, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = col * CARD_WIDTH;
      const y = row * CARD_HEIGHT;
      
      // Index Label: 1-1, 1-2, etc.
      const label = `${batchIdx + 1}-${i + 1}`;

      if (card.word) {
        drawCell(x, y, {
          title: card.word,
          subtitle: card.ipa,
          isBack: false
        }, label);
      }
    });

    // PAGE 2: BACK (Mirrored)
    doc.addPage();
    
    cardsToPrint.forEach((card, i) => {
      // Mirror Logic:
      // Front: 1 2 3
      // Back:  3 2 1
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const mirroredCol = (COLS - 1) - col; 
      
      const x = mirroredCol * CARD_WIDTH;
      const y = row * CARD_HEIGHT;

      // Index Label for Back: 1-1 (Back)
      // Note: We use 'i' (the card index) to match the Front card.
      const label = `${batchIdx + 1}-${i + 1} (Back)`;

      if (card.word) {
        drawCell(x, y, {
          title: card.translation,
          body: card.definition,
          footer: card.example,
          isBack: true
        }, label);
      }
    });
  });

  // Filename Logic
  let filename = "flashcards.pdf";
  if (batches.length > 0) {
    const latestId = batches[0].id;
    const earliestId = batches[batches.length - 1].id;
    
    const extractDate = (id: string) => {
       const match = id.match(/\d{4}-\d{2}-\d{2}/);
       return match ? match[0] : null;
    };

    const d1 = extractDate(earliestId);
    const d2 = extractDate(latestId);

    if (d1 && d2) {
      filename = `flashcards_${d1}_to_${d2}.pdf`;
    } else if (d1) {
      filename = `flashcards_${d1}.pdf`;
    } else {
      const today = new Date().toISOString().split('T')[0];
      filename = `flashcards_${today}.pdf`;
    }
  }

  doc.save(filename);
};
