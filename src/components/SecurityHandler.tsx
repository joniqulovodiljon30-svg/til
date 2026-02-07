
import React, { useEffect, useState } from 'react';
import { addToBlacklist, removeFromBlacklist } from '../services/supabase';

const SecurityHandler: React.FC = () => {
  const [status, setStatus] = useState<string>('Processing security command...');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  useEffect(() => {
    const handleCommand = async () => {
      const params = new URLSearchParams(window.location.search);
      const cmd = params.get('cmd');
      const id = params.get('id');

      if (!id) {
        setStatus('❌ Invalid Request: Missing Device ID.');
        return;
      }

      let result;

      if (cmd === 'block') {
        setStatus('🚫 Blocking user...');
        result = await addToBlacklist(id);
      } else if (cmd === 'unblock') {
        setStatus('✅ Unblocking user...');
        result = await removeFromBlacklist(id);
      } else {
        setStatus('❓ Unknown command.');
        return;
      }

      setStatus(result.message);
      setIsSuccess(result.success);
    };

    handleCommand();
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className={`max-w-md w-full bg-white rounded-2xl p-8 shadow-2xl text-center ${isSuccess ? 'border-b-4 border-emerald-500' : 'border-b-4 border-slate-500'}`}>
        <div className="mb-6 flex justify-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-3xl">
            🛡️
          </div>
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">Security Console</h1>
        <p className={`text-lg font-medium ${isSuccess ? 'text-emerald-600' : 'text-slate-600'}`}>
          {status}
        </p>
        <div className="mt-8 pt-6 border-t border-slate-100">
          <a href="/" className="text-indigo-600 font-bold hover:underline text-sm uppercase tracking-widest">
            Back to App
          </a>
        </div>
      </div>
    </div>
  );
};

export default SecurityHandler;
