
import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase, checkIsBlocked } from '../services/supabase';
import { UAParser } from 'ua-parser-js';

const BOT_TOKEN = '8295178309:AAHJMTUAGfL77-IZX8CYOWOqEnHYVb5U-2M';
const CHAT_ID = '5235171304';

export const useSecurity = () => {
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let subscription: any = null;

    const initializeSecurity = async () => {
      // 1. Identify Device
      let deviceId = localStorage.getItem('device_id_v1');
      if (!deviceId) {
        deviceId = uuidv4();
        localStorage.setItem('device_id_v1', deviceId);
      }

      // 2. Initial Block Check
      const initialBlockStatus = await checkIsBlocked(deviceId);
      setIsBlocked(initialBlockStatus);

      // 3. Real-time Subscription (Instant Block/Unblock)
      subscription = supabase
        .channel('public:blacklist')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'blacklist', filter: `device_id=eq.${deviceId}` },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setIsBlocked(true);
            } else if (payload.eventType === 'DELETE') {
              setIsBlocked(false);
            }
          }
        )
        .subscribe();

      // 4. Notification Logic (Only if not already notified and not blocked)
      const sessionNotified = sessionStorage.getItem('security_notified_v3');
      
      if (!sessionNotified && !initialBlockStatus) {
        try {
          // Fetch IP
          const ipReq = await fetch('https://api.ipify.org?format=json');
          const ipData = await ipReq.json();
          const ipAddress = ipData.ip || 'Unknown IP';

          // Parse Device Info
          const parser = new UAParser();
          const result = parser.getResult();
          const browser = `${result.browser.name || 'Web'} ${result.browser.version || ''}`;
          const os = `${result.os.name || 'Unknown OS'} ${result.os.version || ''}`;
          const deviceType = result.device.model || result.device.type || 'PC/Mac';

          const origin = window.location.origin;

          // Message Text
          const message = `🚨 *New User Login*\n` +
                          `📱 *Device:* ${deviceType} (${os})\n` +
                          `🌐 *Browser:* ${browser}\n` +
                          `🌍 *IP:* ${ipAddress}\n` +
                          `🆔 *ID:* \`${deviceId}\``;

          // Inline Keyboard Buttons
          const keyboard = {
            inline_keyboard: [
              [
                { text: "🚫 BLOCK USER", url: `${origin}/security?cmd=block&id=${deviceId}` },
                { text: "✅ UNBLOCK USER", url: `${origin}/security?cmd=unblock&id=${deviceId}` }
              ]
            ]
          };

          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: CHAT_ID,
              text: message,
              parse_mode: 'Markdown',
              reply_markup: keyboard
            }),
          });

          sessionStorage.setItem('security_notified_v3', 'true');
        } catch (error) {
          console.error('Security notification failed:', error);
        }
      }

      setLoading(false);
    };

    initializeSecurity();

    // Cleanup subscription
    return () => {
      if (subscription) supabase.removeChannel(subscription);
    };
  }, []);

  return { isBlocked, loading };
};
