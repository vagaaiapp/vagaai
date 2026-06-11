-- Migration 003: Create job_alert_history table
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS job_alert_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  jobs_count  INTEGER     NOT NULL DEFAULT 0,
  status      TEXT        NOT NULL DEFAULT 'sent', -- 'sent' | 'error' | 'skipped'
  error_msg   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS job_alert_history_user_idx    ON job_alert_history (user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS job_alert_history_sent_at_idx ON job_alert_history (sent_at DESC);

-- RLS
ALTER TABLE job_alert_history ENABLE ROW LEVEL SECURITY;

-- Users can only read their own history
CREATE POLICY "Users read own alert history"
  ON job_alert_history FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can insert (cron runs with service key)
CREATE POLICY "Service role insert alert history"
  ON job_alert_history FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
