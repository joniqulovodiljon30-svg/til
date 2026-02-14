-- =====================================================
-- VOCAB AI PRO - SUPABASE DATABASE SCHEMA
-- =====================================================
-- This schema creates a secure, multi-user flashcard system
-- with Row Level Security (RLS) to ensure data isolation
-- =====================================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- PROFILES TABLE
-- =====================================================
-- Stores user profile information
-- Automatically created when a user signs up

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable Row Level Security on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
-- Users can only read their own profile
CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can insert their own profile (during signup)
CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- =====================================================
-- FLASHCARDS TABLE
-- =====================================================
-- Stores all flashcard data linked to users

CREATE TABLE IF NOT EXISTS flashcards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  ipa TEXT NOT NULL,
  audio TEXT,
  translation TEXT NOT NULL,
  definition TEXT NOT NULL,
  example TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('en', 'es', 'zh')),
  is_mistake BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable Row Level Security on flashcards
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;

-- RLS Policies for flashcards
-- Users can only view their own flashcards
CREATE POLICY "Users can view own flashcards"
  ON flashcards
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own flashcards
CREATE POLICY "Users can insert own flashcards"
  ON flashcards
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own flashcards
CREATE POLICY "Users can update own flashcards"
  ON flashcards
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own flashcards
CREATE POLICY "Users can delete own flashcards"
  ON flashcards
  FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================
-- These indexes optimize common query patterns

-- Index on user_id for fast user-specific queries
CREATE INDEX IF NOT EXISTS idx_flashcards_user_id 
  ON flashcards(user_id);

-- Index on batch_id for batch operations
CREATE INDEX IF NOT EXISTS idx_flashcards_batch_id 
  ON flashcards(batch_id);

-- Index on created_at for chronological sorting
CREATE INDEX IF NOT EXISTS idx_flashcards_created_at 
  ON flashcards(created_at DESC);

-- Composite index for language filtering per user
CREATE INDEX IF NOT EXISTS idx_flashcards_user_language 
  ON flashcards(user_id, language);

-- Index for mistake filtering
CREATE INDEX IF NOT EXISTS idx_flashcards_user_mistake 
  ON flashcards(user_id, is_mistake) 
  WHERE is_mistake = TRUE;

-- =====================================================
-- TRIGGER: Auto-update updated_at timestamp
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- INSTRUCTIONS FOR SETUP
-- =====================================================
-- 1. Go to your Supabase Dashboard
-- 2. Navigate to: SQL Editor
-- 3. Create a new query
-- 4. Paste this entire file
-- 5. Click "Run" to execute
-- 6. Verify tables appear in Table Editor
-- 7. Check that RLS is enabled (green shield icon)
-- =====================================================
