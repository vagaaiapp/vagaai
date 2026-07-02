-- Migration 009: Verify and complete job_alert_profiles schema
-- Ensures all columns exist with the correct types.
-- Idempotent: ADD COLUMN IF NOT EXISTS is safe to re-run.
-- After migrations 002, 005, 008 the schema should already be correct;
-- this file serves as a single authoritative verification pass.

-- 1. Columns that should be TEXT[]
-- (005 handles empresas_interesse TEXT→TEXT[]; 008 handles formato TEXT→TEXT[])
-- This migration assumes 005 and 008 have already run.

-- setores_preferidos and contrato_tipos: declared TEXT[] in 002, correct.
-- Add them if somehow missing:
ALTER TABLE job_alert_profiles
  ADD COLUMN IF NOT EXISTS contrato_tipos     TEXT[],
  ADD COLUMN IF NOT EXISTS setores_preferidos TEXT[];

-- 2. empresas_interesse: should be TEXT[] after migration 005
-- Idempotent guard: if still TEXT (005 didn't run), convert now.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_alert_profiles'
      AND column_name = 'empresas_interesse'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE job_alert_profiles
      ADD COLUMN IF NOT EXISTS empresas_interesse_new TEXT[];
    UPDATE job_alert_profiles
    SET empresas_interesse_new = CASE
      WHEN empresas_interesse IS NULL OR trim(empresas_interesse) = '' THEN NULL
      WHEN empresas_interesse LIKE '[%' THEN
        ARRAY(
          SELECT trim(both '"' FROM trim(elem))
          FROM unnest(
            string_to_array(regexp_replace(empresas_interesse, '^\[|\]$', '', 'g'), ',')
          ) AS elem
          WHERE trim(elem) <> '' AND trim(elem) <> '""'
        )
      ELSE ARRAY[trim(empresas_interesse)]
    END;
    ALTER TABLE job_alert_profiles DROP COLUMN empresas_interesse;
    ALTER TABLE job_alert_profiles RENAME COLUMN empresas_interesse_new TO empresas_interesse;
  END IF;
END;
$$;

-- 3. filtros_negativos: should be JSONB after migration 005
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_alert_profiles'
      AND column_name = 'filtros_negativos'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE job_alert_profiles
      ADD COLUMN IF NOT EXISTS filtros_negativos_new JSONB;
    -- Per-row conversion with exception handling to avoid aborting on invalid JSON
    DO $inner$
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN SELECT id, filtros_negativos FROM job_alert_profiles WHERE filtros_negativos IS NOT NULL LOOP
        BEGIN
          UPDATE job_alert_profiles
          SET filtros_negativos_new = CASE
            WHEN trim(r.filtros_negativos) = '' THEN NULL
            ELSE r.filtros_negativos::jsonb
          END
          WHERE id = r.id;
        EXCEPTION WHEN invalid_text_representation THEN
          -- Row has invalid JSON — set to NULL, don't abort migration
          UPDATE job_alert_profiles SET filtros_negativos_new = NULL WHERE id = r.id;
        END;
      END LOOP;
    END;
    $inner$;
    ALTER TABLE job_alert_profiles DROP COLUMN filtros_negativos;
    ALTER TABLE job_alert_profiles RENAME COLUMN filtros_negativos_new TO filtros_negativos;
  END IF;
END;
$$;

-- 4. formato: should be TEXT[] after migration 008
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_alert_profiles'
      AND column_name = 'formato'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE job_alert_profiles
      ADD COLUMN IF NOT EXISTS formato_new TEXT[];
    UPDATE job_alert_profiles
    SET formato_new = CASE
      WHEN formato IS NULL OR trim(formato) = '' THEN NULL
      ELSE ARRAY(
        SELECT trim(e)
        FROM unnest(string_to_array(formato, ',')) AS e
        WHERE trim(e) <> ''
      )
    END;
    ALTER TABLE job_alert_profiles DROP COLUMN formato;
    ALTER TABLE job_alert_profiles RENAME COLUMN formato_new TO formato;
  END IF;
END;
$$;

-- 5. Scheduling columns (should exist from 002)
ALTER TABLE job_alert_profiles
  ADD COLUMN IF NOT EXISTS dia_envio      INTEGER,
  ADD COLUMN IF NOT EXISTS horario_envio  TEXT,
  ADD COLUMN IF NOT EXISTS next_run_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_run_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ultimo_envio   TIMESTAMPTZ;

-- 6. Partial index for cron (idempotent)
CREATE INDEX IF NOT EXISTS job_alert_profiles_next_run_idx
  ON job_alert_profiles (next_run_at)
  WHERE ativo = true;
