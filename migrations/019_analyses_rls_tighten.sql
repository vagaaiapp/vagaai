-- Migration 019: aperta RLS de analyses e otimiza cv_saves
--
-- 1. analyses: a política antiga era ALL (SELECT/INSERT/UPDATE/DELETE) para o
--    dono. O cliente só usa SELECT (histórico) e UPDATE (arquivar via
--    archived_at); INSERT é exclusivo do servidor (saveAnalysis em analyze.js,
--    via service key, que bypassa RLS). Deixar INSERT aberto permitia inserir
--    análises falsas via PostgREST e farmar créditos de bônus dos marcos de
--    gamificação (checkAndAwardMilestones conta linhas de analyses).
--
-- 2. cv_saves: mesma política, mas com auth.uid() sem SELECT — re-avaliado por
--    linha (advisor auth_rls_initplan). Recriada com (select auth.uid()).

-- ── analyses ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS own_analyses ON public.analyses;

CREATE POLICY analyses_select_own ON public.analyses
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY analyses_update_own ON public.analyses
  FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── cv_saves ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS cv_saves_owner ON public.cv_saves;

CREATE POLICY cv_saves_owner ON public.cv_saves
  FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
