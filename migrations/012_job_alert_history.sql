-- Migration 012: histórico de envios de alertas
-- O cron (send-alerts.js) já tentava inserir em job_alert_history, mas a tabela
-- nunca existiu (insert engolido por .catch). Esta migração cria a tabela.
-- alert_id é nullable para a Fase 2 (multi-alerta) popular sem nova migração.

CREATE TABLE IF NOT EXISTS job_alert_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  alert_id    uuid,                              -- Fase 2 (multi-alerta)
  sent_at     timestamptz NOT NULL DEFAULT now(),
  jobs_count  integer DEFAULT 0,
  status      text DEFAULT 'sent',               -- 'sent' | 'failed'
  error       text
);

CREATE INDEX IF NOT EXISTS job_alert_history_user_idx
  ON job_alert_history (user_id, sent_at DESC);

ALTER TABLE job_alert_history ENABLE ROW LEVEL SECURITY;

-- Dono lê o próprio histórico
DROP POLICY IF EXISTS job_alert_history_owner ON job_alert_history;
CREATE POLICY job_alert_history_owner
  ON job_alert_history FOR SELECT
  USING (user_id = auth.uid());

-- Service role faz tudo (cron grava via service key)
DROP POLICY IF EXISTS job_alert_history_service ON job_alert_history;
CREATE POLICY job_alert_history_service
  ON job_alert_history FOR ALL
  USING (true) WITH CHECK (true);
