// Security utility functions for blacklist management
// Gracefully handles cases where blacklist table doesn't exist

import { supabase } from './supabase';

export const checkIsBlocked = async (deviceId: string): Promise<boolean> => {
    try {
        const { data, error } = await (supabase as any)
            .from('blacklist')
            .select('device_id')
            .eq('device_id', deviceId)
            .single();

        // PGRST116 = no rows found (not blocked)
        // PGRST205 = table doesn't exist (treat as not blocked)
        if (error) {
            if (error.code === 'PGRST116' || error.code === 'PGRST205') {
                return false; // Not blocked or table doesn't exist
            }
            console.warn('Blacklist check error:', error.message);
            return false; // Default to not blocked on error
        }

        return !!data;
    } catch (err) {
        console.warn('Blacklist check exception:', err);
        return false; // Default to not blocked
    }
};

export const addToBlacklist = async (deviceId: string): Promise<{ success: boolean; message: string }> => {
    try {
        const { error } = await (supabase as any)
            .from('blacklist')
            .insert([{ device_id: deviceId }]);

        if (error) {
            if (error.code === '23505') return { success: true, message: 'User was already blocked.' };
            if (error.code === 'PGRST205') return { success: false, message: 'Blacklist table not configured.' };
            return { success: false, message: error.message };
        }
        return { success: true, message: 'User blocked successfully.' };
    } catch (err) {
        console.warn('Add to blacklist exception:', err);
        return { success: false, message: 'Network error.' };
    }
};

export const removeFromBlacklist = async (deviceId: string): Promise<{ success: boolean; message: string }> => {
    try {
        const { error } = await (supabase as any)
            .from('blacklist')
            .delete()
            .eq('device_id', deviceId);

        if (error) {
            if (error.code === 'PGRST205') return { success: false, message: 'Blacklist table not configured.' };
            return { success: false, message: error.message };
        }
        return { success: true, message: 'User unblocked successfully.' };
    } catch (err) {
        console.warn('Remove from blacklist exception:', err);
        return { success: false, message: 'Network error.' };
    }
};
