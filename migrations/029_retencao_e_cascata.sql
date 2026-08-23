-- 029_retencao_e_cascata.sql — excluir a conta passa a excluir mesmo
--
-- O comentário em api/admin.js diz que remover o usuário "apaga do auth Supabase
-- — cascata remove dados via FK". É verdade para dez tabelas e falso para três:
--
--   analysis_cache      não tem user_id nenhum, e guarda o resultado completo da
--                       análise (score, requisitos, briefing e, quando existe, o
--                       currículo otimizado). Dado derivado de currículo, sem
--                       dono e sem prazo.
--   job_alert_history   tem user_id e NÃO tem chave estrangeira.
--   webhook_events      idem.
--
-- Ou seja: a pessoa pede exclusão, recebe a confirmação, e parte dos dados dela
-- continua no banco. Esta migração fecha os três.

BEGIN;

-- ── analysis_cache: ganha dono e prazo ────────────────────────────────────
-- A chave de busca continua sendo o hash (é o que faz o cache funcionar); o
-- user_id existe para o direito ao esquecimento e para a limpeza.
-- Nullable porque as linhas que já existem não têm como saber de quem eram —
-- o TTL cuida delas.
ALTER TABLE public.analysis_cache
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.analysis_cache
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS analysis_cache_created_idx
  ON public.analysis_cache (created_at);

-- Limpeza por idade. Chamada fire-and-forget por api/analyze.js, no mesmo
-- padrão que já limpa ip_rate_limits — o projeto não tem pg_cron.
CREATE OR REPLACE FUNCTION public.limpar_analysis_cache(dias integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  removidas integer;
BEGIN
  DELETE FROM public.analysis_cache
   WHERE created_at < now() - (dias || ' days')::interval;
  GET DIAGNOSTICS removidas = ROW_COUNT;
  RETURN removidas;
END;
$$;

REVOKE ALL ON FUNCTION public.limpar_analysis_cache(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limpar_analysis_cache(integer) TO service_role;

-- ── job_alert_history: histórico de alerta é dado pessoal ─────────────────
-- Verificado antes de criar: zero linhas órfãs, a FK entra limpa.
ALTER TABLE public.job_alert_history
  DROP CONSTRAINT IF EXISTS job_alert_history_user_id_fkey;

ALTER TABLE public.job_alert_history
  ADD CONSTRAINT job_alert_history_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── webhook_events: SET NULL, não CASCADE ─────────────────────────────────
-- Aqui a decisão é diferente de propósito. São eventos de cobrança do Stripe:
-- apagá-los junto com a conta destrói a trilha contábil de um pagamento que
-- de fato aconteceu. Anular o user_id remove o vínculo com a pessoa — que é o
-- que a LGPD pede — e preserva o registro financeiro.
--
-- Três linhas já apontam para usuários removidos (o DELETE em auth.users passou
-- sem FK). São anuladas antes, senão a constraint não entra.
UPDATE public.webhook_events w
   SET user_id = NULL
 WHERE w.user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = w.user_id);

ALTER TABLE public.webhook_events
  DROP CONSTRAINT IF EXISTS webhook_events_user_id_fkey;

ALTER TABLE public.webhook_events
  ADD CONSTRAINT webhook_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

COMMIT;
