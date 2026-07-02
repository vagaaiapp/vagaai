-- Migration 008: Convert job_alert_profiles.formato from TEXT to TEXT[]
-- Idempotent: checks current column type before altering.
-- Splits comma-separated values, trims whitespace, drops empty strings.

DO $$
BEGIN
  -- Only run if formato is still TEXT (not yet TEXT[])
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_alert_profiles'
      AND column_name = 'formato'
      AND data_type = 'text'
  ) THEN
    -- Add a temporary column for the new array type
    ALTER TABLE job_alert_profiles
      ADD COLUMN IF NOT EXISTS formato_new TEXT[];

    -- Convert each row: split comma-separated values → array, trimming each element
    UPDATE job_alert_profiles
    SET formato_new = CASE
      WHEN formato IS NULL OR trim(formato) = '' THEN NULL
      -- Already looks like a JSON array literal (shouldn't happen but guard anyway)
      WHEN formato LIKE '[%' THEN
        ARRAY(
          SELECT trim(both '"' FROM trim(e))
          FROM unnest(
            string_to_array(
              regexp_replace(formato, '^\[|\]$', '', 'g'), ','
            )
          ) AS e
          WHERE trim(e) <> '' AND trim(e) <> '""'
        )
      ELSE
        -- Normal comma-separated TEXT value
        ARRAY(
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

-- If formato is already TEXT[] this is a no-op (the DO block above skips it)
-- Ensure the column exists even if the table was created without it
ALTER TABLE job_alert_profiles
  ADD COLUMN IF NOT EXISTS formato TEXT[];
