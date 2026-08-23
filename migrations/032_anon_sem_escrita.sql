-- 032_anon_sem_escrita.sql — o papel `anon` para de poder escrever
--
-- Depois da 030, seis tabelas ainda davam INSERT/UPDATE/DELETE a `anon`:
-- analyses, blog_posts, cv_saves, interview_sessions, job_alert_profiles e
-- job_tracker. Elas precisam disso para `authenticated`, e o grant de `anon`
-- veio junto por ser o padrão do Supabase.
--
-- Hoje a RLS bloqueia: `auth.uid()` é NULL num token anônimo, e `NULL = user_id`
-- é NULL, que a política trata como falso. Mas a chave `anon` está publicada no
-- HTML de todas as páginas — é pública por design. Ou seja, é a única credencial
-- que qualquer pessoa da internet já tem na mão, e era a que tinha permissão de
-- escrita em seis tabelas do produto.
--
-- Verificado antes de revogar: nenhuma escrita legítima acontece sem sessão.
-- Todas as chamadas que gravam nessas tabelas montam o header com
-- `Bearer <session.access_token>` — inclusive as do funil de onboarding, que
-- rodam depois do cadastro (onboarding/shared.js:857).
--
-- `SELECT` fica: é inofensivo sob RLS e evita mexer em caminho de leitura que
-- esta auditoria não mapeou linha a linha.

BEGIN;

REVOKE INSERT, UPDATE, DELETE ON public.analyses           FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.blog_posts         FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.cv_saves           FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.interview_sessions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.job_alert_profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.job_tracker        FROM anon;

COMMIT;
