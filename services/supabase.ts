
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://weqgjlcikdtmoqutlxkb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Cx1DBtqBiGnB4GV8h1Y7CQ_EZ51oCJW';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const checkIsBlocked = async (deviceId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('blacklist')
      .select('device_id')
      .eq('device_id', deviceId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Supabase Check Error:', error);
      return false;
    }

    return !!data;
  } catch (err) {
    console.error('Check Blocked Exception:', err);
    return false;
  }
};

export const addToBlacklist = async (deviceId: string): Promise<{ success: boolean; message: string }> => {
  try {
    const { error } = await supabase
      .from('blacklist')
      .insert([{ device_id: deviceId }]);

    if (error) {
      if (error.code === '23505') return { success: true, message: 'User was already blocked.' };
      return { success: false, message: error.message };
    }
    return { success: true, message: 'User blocked successfully.' };
  } catch (err) {
    return { success: false, message: 'Network error.' };
  }
};

export const removeFromBlacklist = async (deviceId: string): Promise<{ success: boolean; message: string }> => {
  try {
    const { error } = await supabase
      .from('blacklist')
      .delete()
      .eq('device_id', deviceId);

    if (error) return { success: false, message: error.message };
    return { success: true, message: 'User unblocked successfully.' };
  } catch (err) {
    return { success: false, message: 'Network error.' };
  }
};
