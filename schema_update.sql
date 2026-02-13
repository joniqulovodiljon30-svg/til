-- =====================================================
-- CRITICAL FIX: Add Missing Columns to flashcards Table
-- =====================================================
-- Run this SQL in Supabase SQL Editor FIRST before using the app
-- =====================================================

-- Add definition column (nullable)
ALTER TABLE flashcards 
ADD COLUMN IF NOT EXISTS definition TEXT;

-- Add example column (nullable)
ALTER TABLE flashcards 
ADD COLUMN IF NOT EXISTS example TEXT;

-- Add ipa (phonetic transcription) column (nullable)
ALTER TABLE flashcards 
ADD COLUMN IF NOT EXISTS ipa TEXT;

-- Add batch_id column for date-based grouping
-- Default to current date in YYYY-MM-DD format
ALTER TABLE flashcards 
ADD COLUMN IF NOT EXISTS batch_id TEXT DEFAULT to_char(CURRENT_DATE, 'YYYY-MM-DD');

-- Add language column to store language code
-- Constraint ensures only valid language codes
ALTER TABLE flashcards 
ADD COLUMN IF NOT EXISTS language TEXT CHECK (language IN ('en', 'es', 'zh'));

-- Create index on language for faster filtering
CREATE INDEX IF NOT EXISTS idx_flashcards_language ON flashcards(language);

-- Create index on batch_id for faster date-based queries
CREATE INDEX IF NOT EXISTS idx_flashcards_batch_id ON flashcards(batch_id);

-- Verify all columns were added successfully
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'flashcards'
ORDER BY ordinal_position;

-- =====================================================
-- IMPORTANT: After running this SQL, do a HARD REFRESH
-- in your browser (Ctrl + F5) to clear the schema cache
-- =====================================================
