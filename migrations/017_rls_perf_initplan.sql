-- Migration 017: performance de RLS em escala
-- (1) Envolve auth.uid() em (select ...) → avaliado 1x por query, não por linha
--     (corrige o lint auth_rls_initplan em 9 policies de dono).
-- (2) Remove policy SELECT duplicada em analyses (own_analyses ALL já cobre SELECT)
--     → elimina o lint multiple_permissive_policies.

-- Policies ALL (USING + WITH CHECK)
ALTER POLICY own_analyses            ON public.analyses           USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY user_own_tracker        ON public.job_tracker        USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY user_own_alert_profile  ON public.job_alert_profiles USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY user_own_alert_sent     ON public.job_alert_sent     USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- Policies SELECT (apenas USING)
ALTER POLICY user_read_own_credits           ON public.user_credits       USING ((select auth.uid()) = user_id);
ALTER POLICY user_own_subscription           ON public.subscriptions      USING ((select auth.uid()) = user_id);
ALTER POLICY job_alert_history_owner         ON public.job_alert_history  USING ((select auth.uid()) = user_id);
ALTER POLICY job_alert_cache_owner           ON public.job_alert_cache    USING ((select auth.uid()) = user_id);
ALTER POLICY "Users can read own milestones" ON public.user_milestones    USING ((select auth.uid()) = user_id);

-- Remove a policy SELECT redundante (own_analyses ALL já permite SELECT do dono)
DROP POLICY IF EXISTS user_read_own_analyses ON public.analyses;
