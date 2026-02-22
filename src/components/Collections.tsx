import React, { useState } from 'react';
import { Flashcard, SupportedLanguage } from '../../types';
import { SmartImportModal } from './SmartImportModal';
import { generatePDF } from '../../services/pdfGenerator';

interface CollectionsProps {
    flashcards: Flashcard[];
    activeLanguage: SupportedLanguage;
    onStudy: (batchId: string) => void;
    onDelete: (batchId: string) => void;
    loading?: boolean;
}

interface BatchGroup {
    batchId: string;
    cards: Flashcard[];
    displayName: string;
    isDemo: boolean;
    isCustom: boolean;
}

export const Collections: React.FC<CollectionsProps> = ({
    flashcards,
    activeLanguage,
    onStudy,
    onDelete,
    loading = false,
}) => {
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const isDark = document.body.classList.contains('dark');

    const languageCards = flashcards.filter(card => card.language === activeLanguage);

    const batches = languageCards.reduce((acc, card) => {
        const batchId = card.batchId || 'General';
        if (!acc[batchId]) {
            acc[batchId] = [];
        }
        acc[batchId].push(card);
        return acc;
    }, {} as Record<string, Flashcard[]>);

    const batchGroups: BatchGroup[] = Object.entries(batches).map(([batchId, cards]) => {
        let displayName = batchId;
        let isDemo = false;
        let isCustom = false;

        if (batchId.startsWith('DEMO-')) {
            isDemo = true;
            const parts = batchId.split('-');
            displayName = `Demo (${parts[1]}) ${parts[2]}`;
        } else if (batchId.startsWith('CUSTOM:')) {
            isCustom = true;
            displayName = batchId.replace('CUSTOM:', '');
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(batchId)) {
            displayName = `${activeLanguage.toUpperCase()} (${batchId})`;
        }

        return {
            batchId,
            cards,
            displayName,
            isDemo,
            isCustom,
        };
    });

    batchGroups.sort((a, b) => {
        if (a.isDemo !== b.isDemo) return a.isDemo ? 1 : -1;
        if (a.isCustom !== b.isCustom) return a.isCustom ? -1 : 1;
        return b.batchId.localeCompare(a.batchId);
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                    COLLECTIONS ({activeLanguage.toUpperCase()})
                </h2>
                {loading && (
                    <div className="flex items-center gap-2 text-indigo-600">
                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="text-sm font-medium">Syncing...</span>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* IMPORT PDF CARD - Always first */}
                <div
                    onClick={() => setIsImportModalOpen(true)}
                    className={`rounded-xl shadow-lg border-2 border-dashed overflow-hidden cursor-pointer transition-all hover:shadow-xl group ${isDark ? 'bg-slate-800 border-indigo-500/40 hover:border-indigo-400' : 'bg-white border-indigo-300 hover:border-indigo-500'}`}
                >
                    <div className="p-8 flex flex-col items-center justify-center min-h-[200px]">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${isDark ? 'bg-indigo-900/50' : 'bg-gradient-to-r from-indigo-100 to-purple-100'}`}>
                            <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </div>
                        <h3 className={`text-lg font-bold mb-2 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>Import PDF</h3>
                        <p className={`text-sm text-center ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                            Upload Cambridge Dictionary
                        </p>
                    </div>
                </div>

                {/* EXISTING COLLECTIONS */}
                {batchGroups.map((batch) => (
                    <div
                        key={batch.batchId}
                        className={`rounded-xl shadow-lg border overflow-hidden hover:shadow-xl transition-all ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}
                    >
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    {batch.isDemo && (
                                        <span className={`px-3 py-1 text-xs font-bold rounded-full uppercase ${isDark ? 'bg-yellow-900/40 text-yellow-400' : 'bg-yellow-100 text-yellow-800'}`}>
                                            Demo
                                        </span>
                                    )}
                                    {batch.isCustom && (
                                        <span className={`px-3 py-1 text-xs font-bold rounded-full uppercase ${isDark ? 'bg-purple-900/40 text-purple-400' : 'bg-purple-100 text-purple-800'}`}>
                                            Custom
                                        </span>
                                    )}
                                    <h3 className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                                        {batch.displayName}
                                    </h3>
                                </div>
                                <button
                                    onClick={() => onDelete(batch.batchId)}
                                    className="text-red-500 hover:text-red-700 transition-colors"
                                    title="Delete collection"
                                >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path
                                            fillRule="evenodd"
                                            d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                </button>
                            </div>

                            <div className={`text-sm mb-4 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                                {batch.cards.length} {batch.cards.length === 1 ? 'card' : 'cards'}
                            </div>

                            <button
                                onClick={() => onStudy(batch.batchId)}
                                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-lg font-bold uppercase tracking-wider transition-all shadow-lg hover:shadow-xl"
                            >
                                Study
                            </button>

                            <button
                                onClick={() => generatePDF([{ id: batch.batchId, cards: batch.cards }])}
                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${isDark ? 'text-indigo-400 bg-indigo-900/30 hover:bg-indigo-900/50' : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'}`}
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Download PDF
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Smart Import Modal */}
            <SmartImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                targetLanguage={activeLanguage}
            />
        </div>
    );
};
