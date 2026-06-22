-- Migration 014: cv_saves — persist user CVs to the cloud
-- Allows users to save/load their CV across devices

CREATE TABLE IF NOT EXISTS cv_saves (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL DEFAULT 'Currículo',
  cv_data     JSONB       NOT NULL,
  template    TEXT        NOT NULL DEFAULT 'classic',
  photo       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Each user can save up to 20 CVs; enforce at RLS level (not a hard limit here)
CREATE INDEX IF NOT EXISTS cv_saves_user_id_idx ON cv_saves (user_id);
CREATE INDEX IF NOT EXISTS cv_saves_updated_at_idx ON cv_saves (updated_at DESC);

ALTER TABLE cv_saves ENABLE ROW LEVEL SECURITY;

-- Users can only see and modify their own CVs
CREATE POLICY "cv_saves_owner" ON cv_saves
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_cv_saves_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cv_saves_updated_at_trigger ON cv_saves;
CREATE TRIGGER cv_saves_updated_at_trigger
  BEFORE UPDATE ON cv_saves
  FOR EACH ROW EXECUTE FUNCTION update_cv_saves_updated_at();
