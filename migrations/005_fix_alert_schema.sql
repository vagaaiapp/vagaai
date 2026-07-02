-- Migration 005: Fix job_alert_profiles schema
-- empresas_interesse: TEXT → TEXT[]
-- filtros_negativos: TEXT → JSONB
-- Compatible with existing data

-- Step 1: convert empresas_interesse TEXT → TEXT[]
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
            string_to_array(
              regexp_replace(empresas_interesse, '^\[|\]$', '', 'g'), ','
            )
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

-- Step 2: convert filtros_negativos TEXT → JSONB
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

    UPDATE job_alert_profiles
    SET filtros_negativos_new = CASE
      WHEN filtros_negativos IS NULL OR trim(filtros_negativos) = '' THEN NULL
      WHEN filtros_negativos LIKE '{%' THEN filtros_negativos::jsonb
      ELSE NULL
    END;

    ALTER TABLE job_alert_profiles DROP COLUMN filtros_negativos;
    ALTER TABLE job_alert_profiles RENAME COLUMN filtros_negativos_new TO filtros_negativos;
  END IF;
END;
$$;

-- Step 3: if columns are already the right type, this is a no-op
-- (idempotent via DO blocks above)

-- Index for cron: find active profiles due to run
CREATE INDEX IF NOT EXISTS job_alert_profiles_next_run_idx
  ON job_alert_profiles (next_run_at)
  WHERE ativo = true;
