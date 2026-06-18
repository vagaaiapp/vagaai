-- Migration 016: tranca escrita de créditos e o EXECUTE das funções SECURITY DEFINER.

-- ── CRÍTICO: user_credits — usuário NÃO pode escrever os próprios créditos ────
-- service_update_credits (UPDATE USING(true) p/ public) permitia a QUALQUER usuário
-- logado dar a si mesmo créditos ilimitados via PostgREST. Todas as mutações de
-- crédito são feitas no backend com a service key (bypass de RLS); o usuário só
-- precisa de SELECT.
DROP POLICY IF EXISTS service_insert_credits ON public.user_credits;
DROP POLICY IF EXISTS service_update_credits ON public.user_credits;
DROP POLICY IF EXISTS own_credits            ON public.user_credits;

CREATE POLICY user_read_own_credits ON public.user_credits
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Defense-in-depth: remove privilégios de escrita a nível de tabela.
REVOKE INSERT, UPDATE, DELETE ON public.user_credits FROM anon, authenticated;

-- ── analyses: remove INSERT permissivo (WITH CHECK(true)) ─────────────────────
-- Permitia inserir análise com user_id de terceiros. own_analyses (auth.uid()=user_id)
-- continua cobrindo inserção/arquivamento das próprias análises (feature de arquivar).
DROP POLICY IF EXISTS service_insert_analyses ON public.analyses;

-- ── Funções SECURITY DEFINER: corta EXECUTE de PUBLIC (default do Postgres) ───
-- As de signup rodam por TRIGGER (on_auth_user_created*) como owner — não dependem
-- deste grant. get_user_id_by_email é usada só pelo webhook (service key).
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.give_welcome_credit()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_free_subscription() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;
