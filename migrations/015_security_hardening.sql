-- Migration 015: blindagem de segurança (auditoria)
-- P0/P1/P2 — corrige vazamento entre usuários, rate-limit, enumeração e funções.

-- ── P0 #1: remove políticas permissivas (USING(true) p/ public) ───────────────
-- service_role já faz BYPASS de RLS, então estas policies só serviam para abrir
-- acesso a anon/authenticated → vazamento entre usuários. As policies de dono
-- (SELECT por user_id) permanecem e cobrem o dashboard.
DROP POLICY IF EXISTS job_alert_cache_service             ON public.job_alert_cache;
DROP POLICY IF EXISTS job_alert_history_service           ON public.job_alert_history;
DROP POLICY IF EXISTS "Service role can manage milestones" ON public.user_milestones;

-- ── P0 #2: habilita RLS na tabela de rate-limit ───────────────────────────────
-- Sem policy → anon/authenticated sem acesso; só service_role passa (bypass).
-- O código (analyze.js) passa a usar a SERVICE key nessas chamadas.
ALTER TABLE public.ip_rate_limits ENABLE ROW LEVEL SECURITY;

-- ── P1 #3/#4: tranca funções SECURITY DEFINER executáveis por anon/auth ───────
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text)  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.give_welcome_credit()       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_free_subscription()  FROM anon, authenticated;

-- ── P2 #9: fixa search_path das funções SECURITY DEFINER (anti-injeção) ───────
ALTER FUNCTION public.get_user_id_by_email(text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.give_welcome_credit()      SET search_path = pg_catalog, public;
ALTER FUNCTION public.create_free_subscription() SET search_path = pg_catalog, public;

-- ── P2 #7: valida formato de e-mail no INSERT anônimo de leads ────────────────
DROP POLICY IF EXISTS anon_insert_email_leads ON public.email_leads;
CREATE POLICY anon_insert_email_leads ON public.email_leads
  FOR INSERT TO anon
  WITH CHECK (
    email IS NOT NULL
    AND char_length(email) BETWEEN 5 AND 254
    AND email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  );
