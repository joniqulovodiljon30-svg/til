import React, { useState } from 'react';
import { Flashcard, SupportedLanguage } from '../../types';
import { SmartImportModal } from './SmartImportModal';

interface CollectionsProps {
    flashcards: Flashcard[];
    activeLanguage: SupportedLanguage;
    onStudy: (batchId: string) => void;
    onDelete: (batchId: string) => void;
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
}) => {
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);

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
            <h2 className="text-2xl font-bold text-gray-900">
                COLLECTIONS ({activeLanguage.toUpperCase()})
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* IMPORT PDF CARD - Always first */}
                <div
                    onClick={() => setIsImportModalOpen(true)}
                    className="bg-white rounded-xl shadow-lg border-2 border-dashed border-indigo-300 hover:border-indigo-500 overflow-hidden cursor-pointer transition-all hover:shadow-xl group"
                >
                    <div className="p-8 flex flex-col items-center justify-center min-h-[200px]">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Import PDF</h3>
                        <p className="text-sm text-gray-500 text-center">
                            Upload Cambridge Dictionary
                        </p>
                    </div>
                </div>

                {/* EXISTING COLLECTIONS */}
                {batchGroups.map((batch) => (
                    <div
                        key={batch.batchId}
                        className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden hover:shadow-xl transition-all"
                    >
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    {batch.isDemo && (
                                        <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded-full uppercase">
                                            Demo
                                        </span>
                                    )}
                                    {batch.isCustom && (
                                        <span className="px-3 py-1 bg-purple-100 text-purple-800 text-xs font-bold rounded-full uppercase">
                                            Custom
                                        </span>
                                    )}
                                    <h3 className="text-lg font-bold text-gray-900">
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

                            <div className="text-sm text-gray-600 mb-4">
                                {batch.cards.length} {batch.cards.length === 1 ? 'card' : 'cards'}
                            </div>

                            <button
                                onClick={() => onStudy(batch.batchId)}
                                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-lg font-bold uppercase tracking-wider transition-all shadow-lg hover:shadow-xl"
                            >
                                Study
                            </button>

                            <div className="mt-4 flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id={`mistakes-${batch.batchId}`}
                                    className="w-4 h-4 text-indigo-600 rounded"
                                />
                                <label
                                    htmlFor={`mistakes-${batch.batchId}`}
                                    className="text-sm text-gray-600"
                                >
                                    Include mistakes only
                                </label>
                            </div>
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
