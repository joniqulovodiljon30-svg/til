
import React, { useEffect, useState } from 'react';

interface InstallBannerProps {
  onVisibilityChange?: (isVisible: boolean) => void;
}

const InstallBanner: React.FC<InstallBannerProps> = ({ onVisibilityChange }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Notify parent whenever visibility changes
  useEffect(() => {
    if (onVisibilityChange) {
      onVisibilityChange(isVisible);
    }
  }, [isVisible, onVisibilityChange]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // 1. Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // 2. Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      // 3. Update UI notify the user they can install the PWA
      setIsVisible(true);
    };

    const handleAppInstalled = () => {
      // Hide the app-provided install promotion
      setIsVisible(false);
      setDeferredPrompt(null);
      console.log('PWA was installed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);

    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-[#1a1a1a] text-white shadow-xl animate-in slide-in-from-top duration-300 border-b border-gray-700">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        
        {/* Left: Logo & Info */}
        <div className="flex items-center gap-3">
          {/* Logo Container */}
          <div className="w-10 h-10 bg-black rounded-full overflow-hidden border border-gray-600 shrink-0">
             <img src="/logo.png" alt="Vocab-AI-PRO Logo" className="w-full h-full object-cover" />
          </div>
          
          {/* Text Info */}
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-wide">vocab-ai-pro</span>
            <span className="text-[10px] text-gray-400">vocab-ai-pro.app</span>
          </div>
        </div>

        {/* Right: Install Button */}
        <button
          onClick={handleInstallClick}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition-colors shadow-lg shadow-indigo-900/20 active:scale-95 ml-3"
        >
          O'rnatish
        </button>
      </div>
    </div>
  );
};

export default InstallBanner;
