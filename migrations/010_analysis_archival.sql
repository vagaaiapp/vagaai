-- Migration 010: arquivamento de análises (soft delete)
ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS analyses_user_archived_idx
  ON analyses (user_id, archived_at, created_at DESC);
