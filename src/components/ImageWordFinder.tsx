
import React, { useState, useRef, useEffect } from 'react';

// Define Tesseract on window since we load it via CDN
declare global {
    interface Window {
        Tesseract: any;
    }
}

interface ImageWordFinderProps {
    onAddWords: (words: string[]) => void;
    onClose: () => void;
}

interface Bbox {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

interface DetectedWord {
    text: string;
    bbox: Bbox;
    id: string;
}

const ImageWordFinder: React.FC<ImageWordFinderProps> = ({ onAddWords, onClose }) => {
    const [image, setImage] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('');
    const [detectedWords, setDetectedWords] = useState<DetectedWord[]>([]);
    const [selectedWords, setSelectedWords] = useState<string[]>([]);

    const imageRef = useRef<HTMLImageElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Handle Image Upload
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    setImage(event.target.result as string);
                    setDetectedWords([]);
                    setSelectedWords([]);
                    // Auto-start OCR when image is loaded
                    processImage(event.target.result as string);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    // OCR Processing
    const processImage = async (imgSrc: string) => {
        setIsProcessing(true);
        setProgress(0);
        setStatus('Initializing OCR engine...');

        try {
            // Use window.Tesseract from CDN
            const result = await window.Tesseract.recognize(
                imgSrc,
                'eng+spa+chi_sim', // Support English, Spanish, Chinese Simplified
                {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            setProgress(Math.round(m.progress * 100));
                            setStatus(`Recognizing text... ${Math.round(m.progress * 100)}%`);
                        } else {
                            setStatus(m.status);
                        }
                    }
                }
            );

            const words: DetectedWord[] = result.data.words.map((w, idx) => ({
                text: w.text,
                bbox: w.bbox,
                id: `word-${idx}-${Date.now()}`
            }));

            setDetectedWords(words);
            setStatus('Done!');
        } catch (err) {
            console.error("OCR Error:", err);
            setStatus('Error recognizing text');
        } finally {
            setIsProcessing(false);
        }
    };

    // Toggle Word Selection
    const toggleWord = (wordText: string) => {
        const cleanWord = wordText.trim();
        if (!cleanWord) return;

        setSelectedWords(prev => {
            if (prev.includes(cleanWord)) {
                return prev.filter(w => w !== cleanWord);
            } else {
                return [...prev, cleanWord];
            }
        });
    };

    // Remove word from list
    const removeWord = (wordToRemove: string) => {
        setSelectedWords(prev => prev.filter(w => w !== wordToRemove));
    };

    // Add all selected words and close
    const handleFinish = () => {
        onAddWords(selectedWords);
        onClose();
    };

    // Copy to clipboard
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const copyAll = () => {
        navigator.clipboard.writeText(selectedWords.join('\n'));
    };

    // Calculate scaling for overlay
    // We need to map the original image bbox to the displayed image size
    const [scale, setScale] = useState(1);

    useEffect(() => {
        if (imageRef.current && detectedWords.length > 0) {
            // Just a simple effect to trigger re-render if needed, 
            // but mostly CSS relative positioning handles the overlay if we set image width to 100%
            // The tricky part is Tesseract bbox is based on ORIGINAL image size.
            // We need to calculate scale factor: displayedWidth / naturalWidth

            const updateScale = () => {
                if (imageRef.current) {
                    const currentScale = imageRef.current.clientWidth / imageRef.current.naturalWidth;
                    setScale(currentScale || 1);
                }
            };

            window.addEventListener('resize', updateScale);
            // Initial update when image loads
            imageRef.current.onload = updateScale;

            return () => window.removeEventListener('resize', updateScale);
        }
    }, [image, detectedWords]);

    return (
        <div className="fixed inset-0 z-[60] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col md:flex-row shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200">

                {/* CLOSE BUTTON */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-50 p-2 bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-500 rounded-full transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                {/* LEFT PANEL: IMAGE & INTERACTION */}
                <div className="flex-1 bg-slate-100 flex flex-col relative overflow-hidden">

                    {/* HEADER / UPLOAD */}
                    <div className="p-4 bg-white border-b border-slate-200 flex justify-between items-center z-10">
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-700 flex items-center gap-2">
                            <span className="text-xl">📸</span> OCR Scanner
                        </h2>
                        <div className="flex gap-2">
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                            >
                                {image ? 'Change Image' : 'Upload Image'}
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleImageUpload}
                            />
                        </div>
                    </div>

                    {/* MAIN CANVAS AREA */}
                    <div className="flex-1 overflow-auto p-8 flex items-center justify-center relative bg-grid-slate-200">
                        {!image ? (
                            <div className="text-center text-slate-400 flex flex-col items-center">
                                <div className="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center mb-4">
                                    <svg className="w-10 h-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                </div>
                                <p className="font-bold">Upload an image to start</p>
                                <p className="text-xs mt-2 max-w-xs">Supports English, Spanish, Chinese text detection</p>
                            </div>
                        ) : (
                            <div className="relative inline-block shadow-2xl rounded-lg overflow-hidden group">
                                <img
                                    ref={imageRef}
                                    src={image}
                                    alt="Uploaded content"
                                    className="max-w-full h-auto object-contain block opacity-100" // Ensure image is visible
                                    style={{ maxHeight: 'calc(90vh - 120px)' }}
                                />

                                {/* OCR LOADING OVERLAY */}
                                {isProcessing && (
                                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center z-20 text-white">
                                        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4"></div>
                                        <p className="font-black tracking-widest uppercase text-xs animate-pulse">{status}</p>

                                        {/* PROGRESS BAR */}
                                        <div className="w-48 h-1 bg-white/20 rounded-full mt-4 overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-400 transition-all duration-300"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* WORD OVERLAYS */}
                                {/* Only verify !isProcessing to avoid flickering overlay while loading */}
                                {!isProcessing && detectedWords.map((word) => {
                                    const isSelected = selectedWords.includes(word.text.trim());

                                    return (
                                        <div
                                            key={word.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleWord(word.text);
                                            }}
                                            className={`absolute cursor-pointer transition-all duration-150 border-b-2
                        ${isSelected
                                                    ? 'bg-indigo-500/40 border-indigo-400'
                                                    : 'hover:bg-yellow-300/30 border-transparent hover:border-yellow-400'
                                                }
                      `}
                                            style={{
                                                left: `${word.bbox.x0 * scale}px`,
                                                top: `${word.bbox.y0 * scale}px`,
                                                width: `${(word.bbox.x1 - word.bbox.x0) * scale}px`,
                                                height: `${(word.bbox.y1 - word.bbox.y0) * scale}px`,
                                            }}
                                            title={word.text}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT PANEL: SELECTED WORDS */}
                <div className="w-full md:w-80 bg-white border-l border-slate-200 flex flex-col z-20">
                    <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">Collected Words</h3>
                            <p className="text-[10px] font-bold text-slate-400 mt-0.5">{selectedWords.length} items</p>
                        </div>
                        {selectedWords.length > 0 && (
                            <button
                                onClick={copyAll}
                                className="text-xs text-indigo-600 hover:text-indigo-800 font-bold"
                                title="Copy all as list"
                            >
                                Copy All
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {selectedWords.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300 p-8 text-center">
                                <p className="text-sm font-bold">No words selected</p>
                                <p className="text-xs mt-2">Click on highlights in the image to add words here.</p>
                            </div>
                        ) : (
                            selectedWords.map((word, idx) => (
                                <div key={idx} className="group bg-white border border-slate-100 rounded-lg p-3 hover:border-indigo-200 hover:shadow-sm transition-all flex justify-between items-center animate-in slide-in-from-left-2 fade-in duration-200">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <span className="text-[10px] font-bold text-slate-300 w-4">{idx + 1}.</span>
                                        <span className="font-medium text-slate-700 truncate">{word}</span>
                                    </div>

                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => copyToClipboard(word)}
                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                                            title="Copy"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                        </button>
                                        <button
                                            onClick={() => removeWord(word)}
                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                                            title="Remove"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="p-4 border-t border-slate-100 bg-slate-50">
                        <button
                            onClick={handleFinish}
                            disabled={selectedWords.length === 0}
                            className={`w-full py-3 rounded-lg font-black text-xs uppercase tracking-widest transition-all ${selectedWords.length > 0
                                ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-200'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                }`}
                        >
                            Add to List
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default ImageWordFinder;
