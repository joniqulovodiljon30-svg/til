import React, { useState } from 'react';
import { Flashcard } from '../../types';

interface CardProps {
    card: Flashcard;
    onNext?: () => void;
    onPrev?: () => void;
    currentIndex?: number;
    totalCards?: number;
}

export const Card: React.FC<CardProps> = ({
    card,
    onNext,
    onPrev,
    currentIndex = 1,
    totalCards = 1,
}) => {
    const [isFlipped, setIsFlipped] = useState(false);
    const [audioPlaying, setAudioPlaying] = useState(false);

    const handleFlip = () => {
        setIsFlipped(!isFlipped);
    };

    const handlePlayAudio = (e: React.MouseEvent) => {
        e.stopPropagation();

        if (card.audio) {
            const audio = new Audio(card.audio);
            setAudioPlaying(true);
            audio.play();
            audio.onended = () => setAudioPlaying(false);
        }
    };

    return (
        <div className="w-full max-w-4xl mx-auto px-4">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">STUDY</h2>
                    <p className="text-sm text-indigo-600 font-medium">
                        Card {currentIndex} / {totalCards} ({card.language.toUpperCase()})
                    </p>
                </div>
                <div className="w-full max-w-xs h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 transition-all duration-300"
                        style={{ width: `${(currentIndex / totalCards) * 100}%` }}
                    />
                </div>
            </div>

            {/* Card */}
            <div
                onClick={handleFlip}
                className="relative bg-white rounded-3xl shadow-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-3xl"
                style={{ minHeight: '500px' }}
            >
                {!isFlipped ? (
                    /* FRONT SIDE */
                    <div className="p-12 flex flex-col items-center justify-center h-full min-h-[500px]">
                        {/* Word */}
                        <h1 className="text-7xl font-black text-gray-900 mb-6 text-center">
                            {card.word}
                        </h1>

                        {/* IPA Pill + Audio */}
                        <div className="flex items-center gap-4 mb-8">
                            {card.ipa && (
                                <div className="px-6 py-3 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-full">
                                    <span className="text-lg font-medium text-indigo-800">
                                        {card.ipa}
                                    </span>
                                </div>
                            )}

                            {card.audio && (
                                <button
                                    onClick={handlePlayAudio}
                                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${audioPlaying
                                            ? 'bg-indigo-600 scale-110'
                                            : 'bg-indigo-500 hover:bg-indigo-600'
                                        } shadow-lg hover:shadow-xl`}
                                >
                                    <svg
                                        className="w-6 h-6 text-white"
                                        fill="currentColor"
                                        viewBox="0 0 20 20"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                </button>
                            )}
                        </div>

                        {/* Tap to Flip */}
                        <p className="text-sm text-gray-400 uppercase tracking-widest font-bold mt-auto">
                            TAP TO FLIP
                        </p>
                    </div>
                ) : (
                    /* BACK SIDE */
                    <div className="p-12 flex flex-col justify-center h-full min-h-[500px] bg-gradient-to-br from-gray-900 to-gray-800">
                        {/* Translation */}
                        <h2 className="text-5xl font-bold text-indigo-400 mb-8 text-center">
                            {card.translation}
                        </h2>

                        {/* Divider */}
                        <div className="w-24 h-1 bg-indigo-500 mx-auto mb-8 rounded-full" />

                        {/* Definition */}
                        {card.definition && (
                            <p className="text-lg text-gray-300 text-center mb-6 leading-relaxed max-w-2xl mx-auto">
                                {card.definition}
                            </p>
                        )}

                        {/* Example */}
                        {card.example && (
                            <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6 max-w-2xl mx-auto">
                                <p className="text-base text-gray-400 italic text-center">
                                    "{card.example}"
                                </p>
                            </div>
                        )}

                        {/* Tap to Flip Back */}
                        <p className="text-sm text-gray-500 uppercase tracking-widest font-bold mt-auto text-center">
                            TAP TO FLIP BACK
                        </p>
                    </div>
                )}
            </div>

            {/* Navigation */}
            <div className="mt-8 flex items-center justify-between">
                <button
                    onClick={onPrev}
                    disabled={currentIndex === 1}
                    className="px-6 py-3 bg-gray-200 hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl font-bold text-gray-700 uppercase tracking-wider transition-all"
                >
                    PREV
                </button>

                <button
                    onClick={() => setIsFlipped(!isFlipped)}
                    className="w-14 h-14 bg-red-100 hover:bg-red-200 rounded-full flex items-center justify-center transition-all group"
                    title="Mark as mistake"
                >
                    <span className="text-2xl group-hover:scale-110 transition-transform">❓</span>
                </button>

                <button
                    onClick={onNext}
                    disabled={currentIndex === totalCards}
                    className="px-6 py-3 bg-gray-200 hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl font-bold text-gray-700 uppercase tracking-wider transition-all"
                >
                    NEXT
                </button>
            </div>
        </div>
    );
};
