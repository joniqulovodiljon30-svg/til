import React, { useState } from 'react';

type SyncState = 'idle' | 'syncing' | 'success' | 'error';

interface MigrationPromptProps {
    localCardCount: number;
    onSync: () => Promise<{ success: boolean; error?: string }>;
    onSkip: () => void;
}

export const MigrationPrompt: React.FC<MigrationPromptProps> = ({
    localCardCount,
    onSync,
    onSkip,
}) => {
    const [state, setState] = useState<SyncState>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handleSync = async () => {
        setState('syncing');
        setErrorMessage(null);

        try {
            const result = await onSync();

            if (result.success) {
                setState('success');
                // Auto-close after success
                setTimeout(() => {
                    onSkip(); // Close modal
                }, 1500);
            } else {
                setState('error');
                setErrorMessage(result.error || 'Failed to sync data');
            }
        } catch (err) {
            setState('error');
            setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
        }
    };

    const handleRetry = () => {
        setState('idle');
        setErrorMessage(null);
    };

    const handleSkip = () => {
        setState('idle');
        setErrorMessage(null);
        onSkip();
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                {/* Icon */}
                <div className="flex justify-center mb-4">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center ${state === 'success' ? 'bg-green-100' : state === 'error' ? 'bg-red-100' : 'bg-indigo-100'
                        }`}>
                        {state === 'success' ? (
                            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        ) : state === 'error' ? (
                            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        ) : (
                            <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                        )}
                    </div>
                </div>

                {/* Title */}
                <h2 className="text-2xl font-black text-slate-900 text-center mb-3">
                    {state === 'success' ? 'Sync Complete!' : state === 'error' ? 'Sync Failed' : 'Merge Your Flashcards?'}
                </h2>

                {/* Description */}
                {state === 'idle' && (
                    <>
                        <p className="text-slate-600 text-center mb-6">
                            You have <strong className="text-indigo-600">{localCardCount} flashcard{localCardCount !== 1 ? 's' : ''}</strong> saved locally.
                            Would you like to sync them to your account?
                        </p>

                        {/* Benefits List */}
                        <div className="bg-indigo-50 rounded-lg p-4 mb-6 space-y-2">
                            <div className="flex items-start gap-3">
                                <svg className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <p className="text-sm text-slate-700">
                                    <strong>Access anywhere:</strong> Your flashcards will sync across all devices
                                </p>
                            </div>
                            <div className="flex items-start gap-3">
                                <svg className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <p className="text-sm text-slate-700">
                                    <strong>Never lose data:</strong> Safely stored in the cloud
                                </p>
                            </div>
                            <div className="flex items-start gap-3">
                                <svg className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <p className="text-sm text-slate-700">
                                    <strong>No duplicates:</strong> Smart sync prevents duplicate entries
                                </p>
                            </div>
                        </div>
                    </>
                )}

                {state === 'syncing' && (
                    <p className="text-slate-600 text-center mb-6">
                        Syncing your flashcards to the cloud...
                    </p>
                )}

                {state === 'success' && (
                    <p className="text-green-600 text-center mb-6 font-semibold">
                        Your flashcards have been successfully synced!
                    </p>
                )}

                {state === 'error' && (
                    <div className="mb-6">
                        <p className="text-red-600 text-center mb-3 font-semibold">
                            Failed to sync your flashcards
                        </p>
                        {errorMessage && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                                {errorMessage}
                            </div>
                        )}
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3">
                    {state === 'idle' && (
                        <>
                            <button
                                onClick={handleSkip}
                                className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-sm uppercase tracking-wider transition-all"
                            >
                                Skip for Now
                            </button>
                            <button
                                onClick={handleSync}
                                className="flex-1 py-3 px-4 bg-indigo-600 text-white hover:bg-indigo-500 font-bold rounded-lg text-sm uppercase tracking-wider transition-all shadow-lg shadow-indigo-200 active:scale-95"
                            >
                                Merge & Sync
                            </button>
                        </>
                    )}

                    {state === 'syncing' && (
                        <button
                            disabled
                            className="flex-1 py-3 px-4 bg-indigo-400 text-white font-bold rounded-lg text-sm uppercase tracking-wider cursor-wait"
                        >
                            <span className="flex items-center justify-center gap-2">
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Syncing...
                            </span>
                        </button>
                    )}

                    {state === 'error' && (
                        <>
                            <button
                                onClick={handleSkip}
                                className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-sm uppercase tracking-wider transition-all"
                            >
                                Skip Sync
                            </button>
                            <button
                                onClick={handleRetry}
                                className="flex-1 py-3 px-4 bg-indigo-600 text-white hover:bg-indigo-500 font-bold rounded-lg text-sm uppercase tracking-wider transition-all shadow-lg shadow-indigo-200 active:scale-95"
                            >
                                Retry
                            </button>
                        </>
                    )}
                </div>

                {/* Skip Note */}
                {state === 'idle' && (
                    <p className="text-xs text-slate-500 text-center mt-4">
                        If you skip, your local flashcards will remain on this device only.
                    </p>
                )}
            </div>
        </div>
    );
};
