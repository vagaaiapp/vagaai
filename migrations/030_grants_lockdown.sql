-- 030_grants_lockdown.sql — a RLS deixa de ser a única barreira
--
-- Vinte das vinte e uma tabelas concedem SELECT, INSERT, UPDATE e DELETE a
-- `anon` E `authenticated`. Hoje nada vaza, porque as políticas de RLS estão
-- todas certas — todas na forma `(select auth.uid()) = user_id`, sem exceção e
-- sem OR. Mas isso significa que o navegador tem permissão de escrever em quase
-- toda tabela do produto e o que o impede é uma única camada.
--
-- Qualquer política permissiva adicionada depois — inclusive por engano no
-- painel — abre a tabela inteira, porque o grant já está lá esperando. A
-- migração 016 já tinha feito exatamente isto em user_credits; esta estende o
-- mesmo tratamento ao resto.
--
-- O que o navegador REALMENTE escreve foi levantado do código antes de revogar
-- qualquer coisa (fetch com method POST/PATCH/DELETE e chamadas .insert()/
-- .update()/.delete() do supabase-js):
--
--   analyses .............. UPDATE  (arquivar)
--   blog_posts ............ INSERT, UPDATE, DELETE  (admin)
--   cv_saves .............. INSERT, UPDATE, DELETE
--   interview_sessions .... UPDATE  (fechar a sessão ao terminar o treino)
--   job_alert_profiles .... INSERT, UPDATE, DELETE
--   job_tracker ........... INSERT, UPDATE, DELETE
--   email_leads ........... INSERT por anon (captura de lead da landing page)
--
-- Todo o resto é escrito só pelo servidor, com a chave de serviço. É esse resto
-- que perde a permissão aqui.

BEGIN;

-- ── Escrita do navegador, mas só a parte que ele usa ──────────────────────
REVOKE INSERT, DELETE ON public.analyses           FROM anon, authenticated;
REVOKE INSERT, DELETE ON public.interview_sessions FROM anon, authenticated;

-- ── Só leitura pelo dono; escrita é do servidor ───────────────────────────
REVOKE INSERT, UPDATE, DELETE ON public.cover_letters      FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions      FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_milestones    FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.job_alert_cache    FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.job_alert_history  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.job_alert_sent     FROM anon, authenticated;

-- ── Nem leitura: nenhuma destas tem política, então já não devolvem linha ──
-- Revogar também o SELECT tira a dependência de a RLS continuar certa. Como
-- hoje elas não são legíveis por ninguém além da service_role, nada quebra.
REVOKE ALL ON public.analysis_cache       FROM anon, authenticated;
REVOKE ALL ON public.ip_rate_limits       FROM anon, authenticated;
REVOKE ALL ON public.email_events         FROM anon, authenticated;
REVOKE ALL ON public.email_sequences      FROM anon, authenticated;
REVOKE ALL ON public.email_sequence_steps FROM anon, authenticated;
REVOKE ALL ON public.user_sequence_state  FROM anon, authenticated;
REVOKE ALL ON public.webhook_events       FROM anon, authenticated;

-- ── email_leads: anon insere, e só ────────────────────────────────────────
-- A captura de lead da landing page precisa do INSERT (política
-- anon_insert_email_leads valida o formato do e-mail). Ler a lista de leads,
-- alterá-la ou apagá-la nunca foi função do navegador.
REVOKE SELECT, UPDATE, DELETE ON public.email_leads FROM anon, authenticated;
REVOKE INSERT ON public.email_leads FROM authenticated;

COMMIT;
