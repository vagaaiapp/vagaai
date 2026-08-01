-- Migration 023: RPCs para a aba "E-mail Marketing" do admin
--
-- Agregação em SQL (SECURITY DEFINER, só service_role) em vez de puxar linhas
-- cruas de email_events pro Node — mesmo padrão de 006_atomic_credit_rpcs.sql.
-- Retorna JSONB (mais simples de consumir no frontend via string-concat, sem
-- precisar de um shape de tabela fixo por chamada).

-- ─── RPC 1: get_email_type_stats ───────────────────────────────────────────
-- Ranking de e-mails por tipo: sent/delivered/opened/clicked/bounced.
CREATE OR REPLACE FUNCTION get_email_type_stats()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  FROM (
    SELECT
      email_type,
      COUNT(*) FILTER (WHERE event = 'sent')      AS sent,
      COUNT(*) FILTER (WHERE event = 'delivered')  AS delivered,
      COUNT(*) FILTER (WHERE event = 'opened')     AS opened,
      COUNT(*) FILTER (WHERE event = 'clicked')    AS clicked,
      COUNT(*) FILTER (WHERE event = 'bounced')    AS bounced
    FROM email_events
    GROUP BY email_type
    ORDER BY sent DESC
  ) t;
$$;

REVOKE EXECUTE ON FUNCTION get_email_type_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_email_type_stats() TO service_role;

-- ─── RPC 2: get_email_quota ─────────────────────────────────────────────────
-- Envios de hoje/mês, para o indicador de cota do Resend free (100/dia, 3000/mês).
CREATE OR REPLACE FUNCTION get_email_quota()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'sent_today', (SELECT COUNT(*) FROM email_events WHERE event = 'sent' AND occurred_at >= CURRENT_DATE),
    'sent_month', (SELECT COUNT(*) FROM email_events WHERE event = 'sent' AND occurred_at >= date_trunc('month', now()))
  );
$$;

REVOKE EXECUTE ON FUNCTION get_email_quota() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_email_quota() TO service_role;

-- ─── RPC 3: get_email_funnel ────────────────────────────────────────────────
-- p_funnel é validado por IF fixo (nunca SQL dinâmico), igual ao `condicao`
-- do motor de sequências. 3 funis suportados: onboarding, winback, trial_sem_uso.
CREATE OR REPLACE FUNCTION get_email_funnel(p_funnel TEXT, p_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_since TIMESTAMPTZ := now() - (p_days || ' days')::interval;
  v_result JSONB;
BEGIN
  IF p_funnel = 'onboarding' THEN
    WITH cohort AS (
      SELECT id, created_at FROM auth.users WHERE created_at >= v_since
    )
    SELECT jsonb_build_array(
      jsonb_build_object('stage', 'Cadastro',        'value', (SELECT COUNT(*) FROM cohort)),
      jsonb_build_object('stage', 'Welcome aberto',   'value', (SELECT COUNT(DISTINCT c.id) FROM cohort c JOIN email_events e ON e.user_id = c.id AND e.email_type = 'welcome' AND e.event = 'opened')),
      jsonb_build_object('stage', 'Day2 aberto',      'value', (SELECT COUNT(DISTINCT c.id) FROM cohort c JOIN email_events e ON e.user_id = c.id AND e.email_type = 'day2' AND e.event = 'opened')),
      jsonb_build_object('stage', '1ª análise',       'value', (SELECT COUNT(DISTINCT c.id) FROM cohort c JOIN analyses a ON a.user_id = c.id)),
      jsonb_build_object('stage', 'Alerta ativado',   'value', (SELECT COUNT(DISTINCT c.id) FROM cohort c JOIN job_alert_profiles j ON j.user_id = c.id AND j.ativo = true)),
      jsonb_build_object('stage', 'Assinante pago',   'value', (SELECT COUNT(DISTINCT c.id) FROM cohort c JOIN subscriptions s ON s.user_id = c.id AND s.status IN ('active','trialing')))
    ) INTO v_result;

  ELSIF p_funnel = 'winback' THEN
    WITH sent_cohort AS (
      SELECT DISTINCT user_id FROM email_events WHERE email_type = 'winback' AND event = 'sent' AND occurred_at >= v_since
    )
    SELECT jsonb_build_array(
      jsonb_build_object('stage', 'Enviado',    'value', (SELECT COUNT(*) FROM sent_cohort)),
      jsonb_build_object('stage', 'Aberto',     'value', (SELECT COUNT(DISTINCT c.user_id) FROM sent_cohort c JOIN email_events e ON e.user_id = c.user_id AND e.email_type = 'winback' AND e.event = 'opened')),
      jsonb_build_object('stage', 'Clicado',    'value', (SELECT COUNT(DISTINCT c.user_id) FROM sent_cohort c JOIN email_events e ON e.user_id = c.user_id AND e.email_type = 'winback' AND e.event = 'clicked')),
      jsonb_build_object('stage', 'Reengajou',  'value', (
        SELECT COUNT(DISTINCT c.user_id) FROM sent_cohort c
        JOIN email_events se ON se.user_id = c.user_id AND se.email_type = 'winback' AND se.event = 'sent'
        JOIN analyses a ON a.user_id = c.user_id AND a.created_at > se.occurred_at
      ))
    ) INTO v_result;

  ELSIF p_funnel = 'trial_sem_uso' THEN
    WITH cohort AS (
      SELECT id, created_at FROM auth.users WHERE created_at >= v_since
    ),
    sem_welcome AS (
      SELECT c.id FROM cohort c
      WHERE NOT EXISTS (SELECT 1 FROM email_events e WHERE e.user_id = c.id AND e.email_type = 'welcome' AND e.event = 'opened')
    )
    SELECT jsonb_build_array(
      jsonb_build_object('stage', 'Cadastrou',              'value', (SELECT COUNT(*) FROM cohort)),
      jsonb_build_object('stage', 'Nunca abriu welcome',    'value', (SELECT COUNT(*) FROM sem_welcome)),
      jsonb_build_object('stage', 'Recebeu day7_alerts',    'value', (SELECT COUNT(DISTINCT s.id) FROM sem_welcome s JOIN email_events e ON e.user_id = s.id AND e.email_type = 'day7_alerts' AND e.event = 'sent')),
      jsonb_build_object('stage', 'Ativou alerta',          'value', (SELECT COUNT(DISTINCT s.id) FROM sem_welcome s JOIN job_alert_profiles j ON j.user_id = s.id AND j.ativo = true))
    ) INTO v_result;

  ELSE
    RETURN jsonb_build_object('error', 'funil desconhecido');
  END IF;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_email_funnel(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_email_funnel(TEXT, INT) TO service_role;
