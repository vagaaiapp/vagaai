-- Migration 001: Add tracking date columns to job_tracker
-- Run in Supabase SQL Editor

ALTER TABLE job_tracker
  ADD COLUMN IF NOT EXISTS stage_moved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS applied_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interview_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS offer_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_up_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ;

-- Unique constraint: one tracker entry per (user, analysis)
-- Partial index so NULLs are excluded (multiple unlinked entries still allowed)
CREATE UNIQUE INDEX IF NOT EXISTS job_tracker_user_analysis_unique
  ON job_tracker (user_id, analysis_id)
  WHERE analysis_id IS NOT NULL;

-- Index for common query patterns
CREATE INDEX IF NOT EXISTS job_tracker_user_status_idx ON job_tracker (user_id, status);
CREATE INDEX IF NOT EXISTS job_tracker_stage_moved_idx ON job_tracker (user_id, stage_moved_at DESC);
