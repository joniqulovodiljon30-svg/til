
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

    // Helper to resize image
    const resizeImage = (file: File): Promise<string> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (readerEvent) => {
                const img = new Image();
                img.onload = () => {
                    // Maximum width for OCR (balance between speed and accuracy)
                    const MAX_WIDTH = 1200;
                    let width = img.width;
                    let height = img.height;

                    if (width > MAX_WIDTH) {
                        height = Math.round((height * MAX_WIDTH) / width);
                        width = MAX_WIDTH;
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(img, 0, 0, width, height);
                        // Convert to slightly compressed JPEG
                        resolve(canvas.toDataURL('image/jpeg', 0.8));
                    } else {
                        resolve(readerEvent.target?.result as string);
                    }
                };
                img.src = readerEvent.target?.result as string;
            };
            reader.readAsDataURL(file);
        });
    };

    // Handle Image Upload
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                // Resize image first for performance
                const optimizedImage = await resizeImage(file);

                setImage(optimizedImage);
                setDetectedWords([]);
                setSelectedWords([]);
                // Auto-start OCR
                processImage(optimizedImage);
            } catch (err) {
                console.error("Error processing image:", err);
            }
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
                'eng+spa', // Added Spanish for better accuracy (especially for hyphenation and accents)
                {
                    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
                    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
                    logger: (m: any) => {
                        if (m.status === 'recognizing text') {
                            setProgress(Math.round(m.progress * 100));
                            setStatus(`Recognizing text... ${Math.round(m.progress * 100)}%`);
                        } else {
                            setStatus(m.status);
                        }
                    }
                }
            );

            const words: DetectedWord[] = result.data.words.map((w: any, idx: number) => ({
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
        <div className="fixed inset-0 z-[60] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-0 md:p-4">
            <div className="bg-white rounded-none md:rounded-2xl w-full max-w-6xl h-full md:h-[90vh] flex flex-col md:flex-row shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200">

                {/* CLOSE BUTTON */}
                <button
                    onClick={onClose}
                    className="absolute top-2 right-2 md:top-4 md:right-4 z-50 p-2 bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-500 rounded-full transition-colors shadow-md"
                >
                    <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                {/* LEFT PANEL: IMAGE & INTERACTION (Mobile: Top 45%, Desktop: Full left) */}
                <div className="h-[45%] md:h-auto md:flex-1 bg-slate-100 flex flex-col relative overflow-hidden border-b md:border-b-0 md:border-r border-slate-200">

                    {/* HEADER / UPLOAD */}
                    <div className="p-3 md:p-4 bg-white border-b border-slate-200 flex justify-between items-center z-10 shrink-0">
                        <h2 className="text-xs md:text-sm font-black uppercase tracking-widest text-slate-700 flex items-center gap-2">
                            <span className="text-lg md:text-xl">📸</span> <span className="hidden sm:inline">OCR Scanner</span>
                        </h2>
                        <div className="flex gap-2 mr-8 md:mr-0">
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                            >
                                {image ? 'Change' : 'Upload'}
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
                    <div className="flex-1 overflow-auto p-4 md:p-8 flex items-center justify-center relative bg-grid-slate-200">
                        {!image ? (
                            <div className="text-center text-slate-400 flex flex-col items-center">
                                <div className="w-16 h-16 md:w-24 md:h-24 bg-slate-200 rounded-full flex items-center justify-center mb-4">
                                    <svg className="w-8 h-8 md:w-10 md:h-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                </div>
                                <p className="font-bold text-sm md:text-base">Upload an image</p>
                                <p className="text-[10px] md:text-xs mt-2 max-w-xs">Supports English, Spanish, Chinese</p>
                            </div>
                        ) : (
                            <div className="relative inline-block shadow-lg rounded-lg overflow-hidden group">
                                <img
                                    ref={imageRef}
                                    src={image}
                                    alt="Uploaded content"
                                    className="max-w-full h-auto object-contain block opacity-100"
                                    style={{ maxHeight: 'calc(90vh - 120px)' }} // Limit image height to fit
                                    onLoad={() => {
                                        if (imageRef.current) {
                                            const currentScale = imageRef.current.clientWidth / imageRef.current.naturalWidth;
                                            setScale(currentScale || 1);
                                        }
                                    }}
                                />

                                {/* OCR LOADING OVERLAY */}
                                {isProcessing && (
                                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center z-20 text-white">
                                        <div className="w-8 h-8 md:w-12 md:h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4"></div>
                                        <p className="font-black tracking-widest uppercase text-[10px] md:text-xs animate-pulse text-center px-4">{status}</p>

                                        {/* PROGRESS BAR */}
                                        <div className="w-32 md:w-48 h-1 bg-white/20 rounded-full mt-4 overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-400 transition-all duration-300"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* WORD OVERLAYS */}
                                {!isProcessing && detectedWords.map((word) => {
                                    const isSelected = selectedWords.includes(word.text.trim());

                                    const left = word.bbox.x0 * scale;
                                    const top = word.bbox.y0 * scale;
                                    const width = (word.bbox.x1 - word.bbox.x0) * scale;
                                    const height = (word.bbox.y1 - word.bbox.y0) * scale;

                                    return (
                                        <div
                                            key={word.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleWord(word.text);
                                            }}
                                            className={`absolute cursor-pointer transition-all duration-150 rounded-sm
                                                ${isSelected
                                                    ? 'bg-indigo-500/50 border-2 border-indigo-400 z-10'
                                                    : 'bg-yellow-300/20 hover:bg-yellow-400/40 border border-yellow-400/30 hover:border-yellow-500'
                                                }
                                            `}
                                            style={{
                                                left: `${left}px`,
                                                top: `${top}px`,
                                                width: `${width}px`,
                                                height: `${height}px`,
                                            }}
                                            title={word.text}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT PANEL: SELECTED WORDS (Mobile: Bottom 55%, Desktop: Right side) */}
                <div className="h-[55%] md:h-auto w-full md:w-80 bg-white flex flex-col z-20 overflow-hidden">
                    <div className="p-3 md:p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                        <div>
                            <h3 className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-900">Collected Words</h3>
                            <p className="text-[10px] font-bold text-slate-400 mt-0.5">{selectedWords.length} items</p>
                        </div>
                        {selectedWords.length > 0 && (
                            <button
                                onClick={copyAll}
                                className="text-[10px] md:text-xs text-indigo-600 hover:text-indigo-800 font-bold uppercase tracking-wider bg-indigo-50 px-2 py-1 rounded"
                                title="Copy all as list"
                            >
                                Copy All
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-50/50">
                        {selectedWords.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300 p-8 text-center">
                                <p className="text-sm font-bold">No words selected</p>
                                <p className="text-xs mt-2">Click highlights on image</p>
                            </div>
                        ) : (
                            selectedWords.map((word, idx) => (
                                <div key={idx} className="group bg-white border border-slate-200 rounded-lg p-3 hover:border-indigo-300 hover:shadow-sm transition-all flex justify-between items-center animate-in slide-in-from-left-2 fade-in duration-200">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <span className="text-[10px] font-bold text-slate-300 w-4">{idx + 1}.</span>
                                        <span className="font-medium text-slate-700 truncate text-sm">{word}</span>
                                    </div>

                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => removeWord(word)}
                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                            title="Remove"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="p-3 md:p-4 border-t border-slate-200 bg-white shrink-0">
                        <button
                            onClick={handleFinish}
                            disabled={selectedWords.length === 0}
                            className={`w-full py-3 rounded-lg font-black text-xs uppercase tracking-widest transition-all ${selectedWords.length > 0
                                ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-200'
                                : 'bg-slate-100 text-slate-300 cursor-not-allowed'
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
