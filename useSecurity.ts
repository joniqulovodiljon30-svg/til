
import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { checkIsBlocked } from '../services/supabase';

const BOT_TOKEN = '8295178309:AAHJMTUAGfL77-IZX8CYOWOqEnHYVb5U-2M';
const CHAT_ID = '5235171304';

export const useSecurity = () => {
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const runSecurityCheck = async () => {
      // 1. Get or Create Device ID
      let deviceId = localStorage.getItem('device_id_v1');
      if (!deviceId) {
        deviceId = uuidv4();
        localStorage.setItem('device_id_v1', deviceId);
      }

      // 2. Check Supabase Blacklist
      const blocked = await checkIsBlocked(deviceId);
      
      if (blocked) {
        setIsBlocked(true);
        setLoading(false);
        return; // Stop here if blocked
      }

      // 3. Send Notification (Only if new session and NOT blocked)
      const sessionNotified = sessionStorage.getItem('security_notified_v2');
      
      if (!sessionNotified && !blocked) {
        try {
          const userAgent = navigator.userAgent;
          const origin = window.location.origin;
          
          // Construct Message with Command Links
          const message = `🚨 *New User Login*\n` +
                          `📱 *Device:* ${userAgent}\n` +
                          `🆔 *ID:* \`${deviceId}\`\n` +
                          `------------------\n` +
                          `👇 *Control Actions:*\n` +
                          `🔗 [🚫 BLOCK USER](${origin}/security?cmd=block&id=${deviceId})\n` +
                          `🔗 [✅ UNBLOCK USER](${origin}/security?cmd=unblock&id=${deviceId})`;

          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: CHAT_ID,
              text: message,
              parse_mode: 'Markdown',
              disable_web_page_preview: true
            }),
          });

          sessionStorage.setItem('security_notified_v2', 'true');
        } catch (error) {
          console.error('Telegram notification failed:', error);
        }
      }

      setLoading(false);
    };

    runSecurityCheck();
  }, []);

  return { isBlocked, loading };
};
