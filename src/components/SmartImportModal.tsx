import React, { useState, useRef } from 'react';
import { SupportedLanguage } from '../../types';
import { useSmartImport } from '../hooks/useSmartImport';

interface SmartImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    targetLanguage: SupportedLanguage;
}

type CollectionType = 'today' | 'custom';

export const SmartImportModal: React.FC<SmartImportModalProps> = ({
    isOpen,
    onClose,
    targetLanguage,
}) => {
    const [collectionType, setCollectionType] = useState<CollectionType>('today');
    const [customCollectionName, setCustomCollectionName] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const { importing, error, progress, importFromPDF, resetError } = useSmartImport();

    if (!isOpen) return null;

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type === 'application/pdf') {
            setSelectedFile(file);
            resetError();
        } else {
            alert('Please select a valid PDF file');
        }
    };

    const handleImport = async () => {
        const batchId = collectionType === 'today'
            ? 'TODAY'
            : `CUSTOM:${customCollectionName.trim()}`;

        if (collectionType === 'custom' && !customCollectionName.trim()) {
            alert('Please enter a collection name');
            return;
        }

        if (!selectedFile) {
            alert('Please select a PDF file');
            return;
        }

        await importFromPDF(selectedFile, batchId, targetLanguage);

        if (!error) {
            setSelectedFile(null);
            setCustomCollectionName('');
            onClose();
        }
    };

    const handleRetry = () => {
        resetError();
        handleImport();
    };

    const handleClose = () => {
        if (!importing) {
            resetError();
            setSelectedFile(null);
            setCustomCollectionName('');
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-2xl font-bold text-gray-900">Smart Import</h2>
                        <button
                            onClick={handleClose}
                            disabled={importing}
                            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <p className="text-sm text-gray-600">
                        Import structured vocabulary from Cambridge Dictionary PDFs
                    </p>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Collection Selector */}
                    <div className="mb-6">
                        <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">
                            Target Collection
                        </label>
                        <div className="space-y-3">
                            <label className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-indigo-300">
                                <input
                                    type="radio"
                                    name="collection"
                                    checked={collectionType === 'today'}
                                    onChange={() => setCollectionType('today')}
                                    disabled={importing}
                                    className="w-5 h-5 text-indigo-600"
                                />
                                <div>
                                    <div className="font-bold text-gray-900">Add to Today's Batch</div>
                                    <div className="text-sm text-gray-500">
                                        Batch ID: {new Date().toISOString().split('T')[0]}
                                    </div>
                                </div>
                            </label>

                            <label className="flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-indigo-300">
                                <input
                                    type="radio"
                                    name="collection"
                                    checked={collectionType === 'custom'}
                                    onChange={() => setCollectionType('custom')}
                                    disabled={importing}
                                    className="w-5 h-5 text-indigo-600 mt-1"
                                />
                                <div className="flex-1">
                                    <div className="font-bold text-gray-900 mb-2">Create New Collection</div>
                                    {collectionType === 'custom' && (
                                        <input
                                            type="text"
                                            value={customCollectionName}
                                            onChange={(e) => setCustomCollectionName(e.target.value)}
                                            placeholder="Enter collection name..."
                                            disabled={importing}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
                                        />
                                    )}
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* PDF Upload */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">
                            Select PDF File
                        </label>
                        <div
                            onClick={() => !importing && fileInputRef.current?.click()}
                            className={`border-2 border-dashed border-gray-300 rounded-lg p-8 text-center transition-all ${importing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-indigo-400'
                                }`}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf"
                                onChange={handleFileSelect}
                                disabled={importing}
                                className="hidden"
                            />
                            {selectedFile ? (
                                <div>
                                    <div className="text-4xl mb-2">📄</div>
                                    <div className="font-bold text-gray-900">{selectedFile.name}</div>
                                    <div className="text-sm text-gray-500 mt-1">
                                        {(selectedFile.size / 1024).toFixed(2)} KB
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <div className="text-4xl mb-2">📤</div>
                                    <div className="font-bold text-gray-900">Click to upload PDF</div>
                                    <div className="text-sm text-gray-500 mt-2">
                                        Cambridge Dictionary format required
                                    </div>
                                    <div className="text-xs text-gray-400 mt-1">
                                        PDF must contain: Word, IPA, Definition, Example
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Info Box */}
                    <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-start gap-3">
                            <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                            <div className="flex-1 text-sm">
                                <div className="font-bold text-blue-900 mb-1">How it works</div>
                                <ul className="text-blue-700 space-y-1 list-disc list-inside">
                                    <li>PDF is parsed locally (no AI for extraction)</li>
                                    <li>AI translates words to Uzbek only</li>
                                    <li>Definitions and examples stay in original language</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    {importing && (
                        <div className="mt-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-bold text-indigo-900">{progress.status}</span>
                                <span className="text-sm font-bold text-indigo-600">{progress.percent}%</span>
                            </div>
                            <div className="w-full h-3 bg-indigo-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 transition-all duration-500 ease-out"
                                    style={{ width: `${progress.percent}%` }}
                                />
                            </div>
                            <div className="mt-3 text-xs text-indigo-600 space-y-1">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${progress.percent >= 20 ? 'bg-green-500' : 'bg-gray-300'}`} />
                                    <span>Reading PDF</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${progress.percent >= 50 ? 'bg-green-500' : progress.percent >= 20 ? 'bg-indigo-500 animate-pulse' : 'bg-gray-300'}`} />
                                    <span>Extracting Vocabulary</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${progress.percent >= 80 ? 'bg-green-500' : progress.percent >= 50 ? 'bg-indigo-500 animate-pulse' : 'bg-gray-300'}`} />
                                    <span>Translating with AI</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${progress.percent >= 100 ? 'bg-green-500' : progress.percent >= 80 ? 'bg-indigo-500 animate-pulse' : 'bg-gray-300'}`} />
                                    <span>Saving to Database</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Error Display */}
                    {error && !importing && (
                        <div className="mt-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
                            <div className="flex items-start gap-3 mb-4">
                                <svg className="w-6 h-6 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                <div className="flex-1">
                                    <div className="font-bold text-red-900 text-sm mb-1">Import Failed</div>
                                    <div className="text-red-700 text-sm">{error}</div>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleRetry}
                                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-sm uppercase tracking-wider transition-all"
                                >
                                    Retry
                                </button>
                                <button
                                    onClick={handleClose}
                                    className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-bold text-sm uppercase tracking-wider transition-all"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-200 flex gap-3">
                    <button
                        onClick={handleClose}
                        disabled={importing}
                        className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold text-gray-700 uppercase tracking-wider transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleImport}
                        disabled={importing || !selectedFile}
                        className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold uppercase tracking-wider transition-all shadow-lg hover:shadow-xl"
                    >
                        {importing ? 'Importing...' : 'Import'}
                    </button>
                </div>
            </div>
        </div>
    );
};
