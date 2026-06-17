-- Migration 014: cria job_alert_cache e corrige job_alert_history
--
-- PROBLEMA: o cron (send-alerts.js) enviava o e-mail com sucesso mas a tabela
-- job_alert_cache não existia — o upsert falhava silenciosamente (.catch) e o
-- dashboard exibia "Nenhuma vaga no cache ainda" mesmo após o envio.
--
-- CORREÇÃO:
--   1. Cria job_alert_cache (1 linha por usuário, PK = user_id)
--   2. Adiciona coluna `error` em job_alert_history (migration 003 criou com
--      `error_msg`, mas o cron insere com `error` — name mismatch silencioso)
--   3. Adiciona coluna `alert_id` em job_alert_history (Fase 2 multi-alerta)

-- ── 1. job_alert_cache ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_alert_cache (
  user_id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  jobs            text        NOT NULL DEFAULT '[]',
  cached_at       timestamptz NOT NULL DEFAULT now(),
  source          text        NOT NULL DEFAULT 'cron',   -- 'cron' | 'demand'
  last_manual_at  timestamptz
);

ALTER TABLE job_alert_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_alert_cache_owner ON job_alert_cache;
CREATE POLICY job_alert_cache_owner
  ON job_alert_cache FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS job_alert_cache_service ON job_alert_cache;
CREATE POLICY job_alert_cache_service
  ON job_alert_cache FOR ALL
  USING (true) WITH CHECK (true);

-- ── 2. job_alert_history: colunas ausentes ────────────────────────────────────
ALTER TABLE job_alert_history
  ADD COLUMN IF NOT EXISTS error     text,
  ADD COLUMN IF NOT EXISTS alert_id  uuid;
