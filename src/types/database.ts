// Database types for Supabase
export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string;
                    email: string;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id: string;
                    email: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    email?: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
            flashcards: {
                Row: {
                    id: string;
                    user_id: string;
                    front: string;
                    back: string;
                    ipa: string;
                    audio: string | null;
                    definition: string;
                    example: string;
                    batch_id: string;
                    category: 'en' | 'es' | 'zh';
                    is_mistake: boolean;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    front: string;
                    back: string;
                    ipa?: string;
                    audio?: string | null;
                    definition?: string;
                    example?: string;
                    batch_id: string;
                    category: 'en' | 'es' | 'zh';
                    is_mistake?: boolean;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    front?: string;
                    back?: string;
                    ipa?: string;
                    audio?: string | null;
                    definition?: string;
                    example?: string;
                    batch_id?: string;
                    category?: 'en' | 'es' | 'zh';
                    is_mistake?: boolean;
                    created_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: 'flashcards_user_id_fkey';
                        columns: ['user_id'];
                        referencedRelation: 'profiles';
                        referencedColumns: ['id'];
                    }
                ];
            };
        };
        Views: {};
        Functions: {};
        Enums: {};
    };
}
