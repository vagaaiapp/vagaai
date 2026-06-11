-- Migration 002: Add scheduling and filter columns to job_alert_profiles
-- Run in Supabase SQL Editor

ALTER TABLE job_alert_profiles
  ADD COLUMN IF NOT EXISTS next_run_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_run_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dia_envio            INTEGER,
  ADD COLUMN IF NOT EXISTS horario_envio        TEXT,
  ADD COLUMN IF NOT EXISTS contrato_tipos       TEXT[],
  ADD COLUMN IF NOT EXISTS formato              TEXT,
  ADD COLUMN IF NOT EXISTS empresas_interesse   TEXT,
  ADD COLUMN IF NOT EXISTS setores_preferidos   TEXT[],
  ADD COLUMN IF NOT EXISTS filtros_negativos    TEXT;

-- Unique constraint: one alert profile per user
CREATE UNIQUE INDEX IF NOT EXISTS job_alert_profiles_user_unique
  ON job_alert_profiles (user_id);

-- Index for cron query: find profiles due to run
CREATE INDEX IF NOT EXISTS job_alert_profiles_next_run_idx
  ON job_alert_profiles (next_run_at)
  WHERE ativo = true;
