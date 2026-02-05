
import React, { useState } from 'react';
import { Word } from '../types';

interface WordListProps {
  words: Word[];
  onDelete: (id: string) => void;
}

const WordList: React.FC<WordListProps> = ({ words, onDelete }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const filteredWords = words.filter(w => 
    w.english.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.uzbek.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <input 
            type="text"
            placeholder="Qidiruv..."
            className="w-full p-4 pl-12 bg-white border border-slate-200 rounded-xl text-sm focus:ring-1 focus:ring-slate-900 outline-none transition-all shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute left-4 top-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="md:hidden p-4 bg-white border border-slate-200 rounded-xl"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-slate-500 transition-transform ${isCollapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {!isCollapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredWords.map((word) => {
            const accuracy = word.stats.timesAsked > 0 
              ? Math.round((word.stats.correctCount / word.stats.timesAsked) * 100) 
              : 0;

            return (
              <div 
                key={word.id} 
                className="bg-white p-5 rounded-xl border border-slate-200 flex flex-col hover:border-slate-900 transition-all shadow-sm relative group"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-300">
                    {word.type || 'NOMA\'LUM'}
                  </span>
                  <button 
                    onClick={() => onDelete(word.id)}
                    className="text-slate-200 hover:text-red-500 transition-colors p-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="flex flex-col mb-4">
                  <span className="text-lg font-black text-slate-900 leading-tight tracking-tight">{word.english}</span>
                  <span className="text-sm text-slate-500 mt-1 font-medium">{word.uzbek}</span>
                </div>

                <div className="mt-auto pt-4 border-t border-slate-50 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      word.stats.lastResult === 'correct' ? 'bg-green-500' : 
                      word.stats.lastResult === 'incorrect' ? 'bg-red-500' : 'bg-slate-100'
                    }`} />
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">
                      ANIQLIK: {accuracy}%
                    </span>
                  </div>
                  <span className="text-[9px] font-black text-slate-200 uppercase tracking-tighter">
                    Soni: {word.stats.timesAsked}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {filteredWords.length === 0 && (
        <div className="text-center py-12 text-slate-300 text-[10px] font-black uppercase tracking-widest">
          Natija yo'q
        </div>
      )}
    </div>
  );
};

export default WordList;
