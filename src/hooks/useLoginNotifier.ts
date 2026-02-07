
import { useEffect } from 'react';
import { UAParser } from 'ua-parser-js';

const BOT_TOKEN = '8295178309:AAHJMTUAGfL77-IZX8CYOWOqEnHYVb5U-2M';
const CHAT_ID = '5235171304';

export const useLoginNotifier = () => {
  useEffect(() => {
    // Check if we already notified in this session to prevent spam on refresh
    const hasNotified = sessionStorage.getItem('login_notified_v1');
    if (hasNotified) return;

    const sendNotification = async () => {
      try {
        const parser = new UAParser();
        const result = parser.getResult();
        
        // Parse device info
        const device = result.device.model || result.device.type || 'Desktop/PC';
        const os = `${result.os.name || 'Unknown OS'} ${result.os.version || ''}`.trim();
        const browser = `${result.browser.name || 'Unknown Browser'} ${result.browser.version || ''}`.trim();
        
        // Get current time in Uzbekistan
        const now = new Date().toLocaleString('uz-UZ', { 
            timeZone: 'Asia/Tashkent',
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const message = `🚨 *NEW LOGIN DETECTED*\n\n` +
                        `📱 *Device:* ${device} (${os})\n` +
                        `🌐 *Browser:* ${browser}\n` +
                        `⏰ *Time:* ${now}\n` +
                        `🔗 *Link:* Flash-XB7 App`;

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'Markdown',
          }),
        });

        // Mark as notified for this session
        sessionStorage.setItem('login_notified_v1', 'true');
      } catch (error) {
        console.error('Failed to send login notification:', error);
      }
    };

    sendNotification();
  }, []);
};
