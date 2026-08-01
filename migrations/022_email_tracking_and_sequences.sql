-- Migration 022: tracking de e-mail (Resend) + motor de sequências de onboarding
--
-- CONTEXTO: hoje o envio de e-mail (onboarding-emails.js, cron-onboarding.js,
-- send-alerts.js, webhook.js) não tem nenhum tracking de entrega/abertura/clique
-- e as sequências de onboarding (day2/day5/day7/winback/tracker_followup) são
-- hardcoded em cron-onboarding.js. Esta migração cria:
--   1. email_events — log de sent/delivered/opened/clicked/bounced/complained,
--      populado no momento do envio (sent) e via novo webhook do Resend
--      (api/resend-webhook.js) para os demais eventos.
--   2. email_sequences / email_sequence_steps / user_sequence_state — motor
--      de sequências orientado a dados, com seed dos fluxos já existentes.
--
-- Todas as tabelas são acessadas exclusivamente via service_role (mesmo padrão
-- de ip_rate_limits em 015_security_hardening.sql): RLS ligado, sem nenhuma
-- policy para anon/authenticated → só service_role passa (bypass nativo).

-- ── 1. email_events ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_events (
  id           bigserial   PRIMARY KEY,
  resend_id    text,
  user_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  email_type   text        NOT NULL,
  event        text        NOT NULL,   -- 'sent'|'delivered'|'opened'|'clicked'|'bounced'|'complained'|'delivery_delayed'
  to_email     text,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  meta         jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_events_resend_id
  ON email_events(resend_id) WHERE resend_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_events_user_type
  ON email_events(user_id, email_type);
CREATE INDEX IF NOT EXISTS idx_email_events_type_event_occurred
  ON email_events(email_type, event, occurred_at DESC);
-- Absorve retries do webhook do Resend sem duplicar linha.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_dedupe
  ON email_events(resend_id, event) WHERE resend_id IS NOT NULL;

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

-- ── 2. motor de sequências ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_sequences (
  id          bigserial   PRIMARY KEY,
  name        text        UNIQUE NOT NULL,
  trigger     text        NOT NULL,   -- 'user_created' | 'tracker_stage_moved'
  ativo       boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_sequence_steps (
  id            bigserial PRIMARY KEY,
  sequence_id   bigint    NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
  ordem         int       NOT NULL,
  delay_dias    numeric   NOT NULL,
  janela_horas  numeric   NOT NULL DEFAULT 18,
  email_type    text      NOT NULL,
  -- Nome de condição avaliado por dicionário fixo no código (CONDITIONS em
  -- cron-onboarding.js) — nunca SQL dinâmico. Ex: 'no_active_alert'.
  condicao      text,
  ativo         boolean   NOT NULL DEFAULT true,
  UNIQUE(sequence_id, ordem)
);

CREATE TABLE IF NOT EXISTS user_sequence_state (
  id                bigserial   PRIMARY KEY,
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sequence_id       bigint      NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
  step_atual        int         NOT NULL DEFAULT 0,
  base_event_at     timestamptz NOT NULL,
  proximo_envio_em  timestamptz,
  concluido         boolean     NOT NULL DEFAULT false,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Permite reabrir a sequência com um novo evento-base (ex: tracker_followup
  -- reaberto por um novo card do usuário).
  UNIQUE(user_id, sequence_id, base_event_at)
);

CREATE INDEX IF NOT EXISTS idx_user_sequence_state_pending
  ON user_sequence_state(proximo_envio_em) WHERE NOT concluido;

ALTER TABLE email_sequences       ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sequence_steps  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sequence_state   ENABLE ROW LEVEL SECURITY;

-- ── 3. seed dos fluxos hardcoded existentes (dados, não schema) ────────────
-- free_renewed fica fora do motor: seu gatilho é o estado atual do ciclo de
-- análise (janela 30-40 dias desde a última análise), não "N dias desde um
-- evento fixo" — continua hardcoded em cron-onboarding.js.
INSERT INTO email_sequences (name, trigger) VALUES
  ('onboarding', 'user_created'),
  ('winback', 'user_created'),
  ('tracker_followup', 'tracker_stage_moved')
ON CONFLICT (name) DO NOTHING;

INSERT INTO email_sequence_steps (sequence_id, ordem, delay_dias, janela_horas, email_type, condicao)
SELECT id, 1, 2, 18, 'day2', NULL FROM email_sequences WHERE name = 'onboarding'
UNION ALL
SELECT id, 2, 5, 18, 'day5', NULL FROM email_sequences WHERE name = 'onboarding'
UNION ALL
SELECT id, 3, 7, 36, 'day7_alerts', 'no_active_alert' FROM email_sequences WHERE name = 'onboarding'
UNION ALL
SELECT id, 1, 21, 60, 'winback', 'no_active_alert_and_no_recent_analysis' FROM email_sequences WHERE name = 'winback'
UNION ALL
SELECT id, 1, 7, 12, 'tracker_followup', NULL FROM email_sequences WHERE name = 'tracker_followup'
ON CONFLICT (sequence_id, ordem) DO NOTHING;
