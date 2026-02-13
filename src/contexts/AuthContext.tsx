import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// Auth context type
interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
    signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
    signOut: () => Promise<void>;
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth Provider Component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    // Initialize auth state and listen for changes
    useEffect(() => {
        // Get initial session on mount
        supabase.auth.getSession().then(({ data: { session } }) => {
            console.log('[AuthContext] Initial session loaded:', session?.user?.id || 'No user');
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        });

        // Subscribe to auth state changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            console.log('[AuthContext] Auth state changed:', _event, session?.user?.id || 'No user');
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        });

        // Cleanup subscription on unmount
        return () => {
            subscription.unsubscribe();
        };
    }, []);

    // Sign up with email and password
    const signUp = useCallback(async (email: string, password: string) => {
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
            });

            if (error) {
                console.error('[AuthContext] Signup error:', error.message);
                return { error };
            }

            console.log('[AuthContext] Signup successful, user ID:', data.user?.id);

            // Create profile for the new user
            if (data.user) {
                const { error: profileError } = await supabase
                    .from('profiles')
                    .insert({
                        id: data.user.id,
                        email: data.user.email!,
                    });

                if (profileError) {
                    console.error('[AuthContext] Error creating profile:', profileError.message);
                } else {
                    console.log('[AuthContext] Profile created successfully');
                }
            }

            return { error: null };
        } catch (error) {
            console.error('[AuthContext] Signup exception:', error);
            return { error: error as AuthError };
        }
    }, []);

    // Sign in with email and password
    const signIn = useCallback(async (email: string, password: string) => {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                console.error('[AuthContext] Login error:', error.message);
                return { error };
            }

            console.log('[AuthContext] Login successful, user ID:', data.user?.id);
            return { error: null };
        } catch (error) {
            console.error('[AuthContext] Login exception:', error);
            return { error: error as AuthError };
        }
    }, []);

    // Sign out - fully reset auth state
    const signOut = useCallback(async () => {
        try {
            console.log('[AuthContext] Signing out...');
            await supabase.auth.signOut();
            console.log('[AuthContext] Signed out successfully');
        } catch (error) {
            console.error('[AuthContext] Error signing out:', error);
            // Force clear state even if signOut fails
            setSession(null);
            setUser(null);
        }
    }, []);

    const value = {
        user,
        session,
        loading,
        signUp,
        signIn,
        signOut,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use auth context
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
