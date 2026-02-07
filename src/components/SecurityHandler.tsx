
import React, { useEffect, useState } from 'react';
import { addToBlacklist, removeFromBlacklist } from '../services/supabase';

const SecurityHandler: React.FC = () => {
  const [status, setStatus] = useState<string>('Processing...');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [icon, setIcon] = useState<string>('⏳');

  useEffect(() => {
    const handleCommand = async () => {
      const params = new URLSearchParams(window.location.search);
      const cmd = params.get('cmd');
      const id = params.get('id');

      if (!id) {
        setStatus('Invalid Request: Missing Device ID');
        setIcon('❌');
        return;
      }

      let result;

      if (cmd === 'block') {
        setStatus('Blocking User...');
        result = await addToBlacklist(id);
        setIcon(result.success ? '🛡️' : '⚠️');
      } else if (cmd === 'unblock') {
        setStatus('Unblocking User...');
        result = await removeFromBlacklist(id);
        setIcon(result.success ? '✅' : '⚠️');
      } else {
        setStatus('Unknown Command');
        setIcon('❓');
        return;
      }

      setStatus(result.message);
      setIsSuccess(result.success);
    };

    handleCommand();
  }, []);

  const handleClose = () => {
    // Attempt to close; if script didn't open it, redirect to home
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
      <div className="max-w-sm w-full bg-white rounded-3xl p-8 shadow-2xl text-center transform transition-all animate-in fade-in zoom-in-95 duration-300">
        
        <div className={`w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center text-5xl shadow-inner ${isSuccess ? 'bg-indigo-50' : 'bg-red-50'}`}>
          {icon}
        </div>

        <h1 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">
          System Action
        </h1>
        
        <p className="text-slate-500 font-medium mb-8 leading-relaxed">
          {status}
        </p>

        <button 
          onClick={handleClose}
          className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200"
        >
          Done
        </button>
      </div>
    </div>
  );
};

export default SecurityHandler;
