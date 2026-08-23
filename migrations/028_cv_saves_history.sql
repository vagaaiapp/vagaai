-- 028_cv_saves_history.sql — o currículo passa a ter passado
--
-- cv_saves tem `unique (user_id)` desde a migração 024: uma linha por conta,
-- sobrescrita a cada salvamento. Isso torna "meu currículo melhorou desde que
-- entrei?" impossível de responder — não por falta de tela, mas porque o dado
-- nunca existiu. É a pergunta que prova que o produto funciona, e era a única
-- que ele não conseguia nem começar a responder.
--
-- O histórico é escrito por trigger, não pelo cliente. Três motivos: o
-- navegador escreve em cv_saves de quatro telas diferentes (/curriculo, /cv,
-- e os dois funis de onboarding) e nenhuma precisa saber que existe histórico;
-- ninguém pode esquecer de gravar; e uma versão gravada pela aplicação poderia
-- ser omitida por um cliente adulterado, enquanto o trigger sempre roda.

BEGIN;

CREATE TABLE IF NOT EXISTS public.cv_saves_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cv_data    jsonb NOT NULL,
  -- Denormalizado de propósito: a completude é o número que a pessoa vê e o
  -- eixo Y do gráfico de evolução. Recalculá-la a cada leitura obrigaria a
  -- reimplementar em SQL a regra que hoje vive em js/cv-completude.js, e as
  -- duas iam divergir no primeiro ajuste.
  completude smallint,
  origem     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cv_saves_history_user_idx
  ON public.cv_saves_history (user_id, created_at DESC);

ALTER TABLE public.cv_saves_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cv_saves_history_read_own ON public.cv_saves_history;
CREATE POLICY cv_saves_history_read_own ON public.cv_saves_history
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Só o trigger escreve. O dono lê o próprio histórico e mais nada.
REVOKE INSERT, UPDATE, DELETE ON public.cv_saves_history FROM anon, authenticated;

-- ── O trigger ─────────────────────────────────────────────────────────────
-- SECURITY DEFINER porque a RLS acima não concede INSERT a ninguém: quem
-- grava é a função, em nome do dono da linha que disparou o trigger.
-- search_path fixo é obrigatório em SECURITY DEFINER — sem ele, um search_path
-- manipulado na sessão resolveria `cv_saves_history` para outro schema.
CREATE OR REPLACE FUNCTION public.registrar_versao_cv()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Salvamento que não mudou nada não é versão. Sem esta guarda, cada
  -- autosave do editor viraria uma linha e o gráfico de evolução ficaria
  -- ilegível — além de crescer sem motivo.
  IF TG_OP = 'UPDATE' AND NEW.cv_data IS NOT DISTINCT FROM OLD.cv_data THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.cv_saves_history (user_id, cv_data, completude, origem)
  VALUES (
    NEW.user_id,
    NEW.cv_data,
    -- A completude vem de quem salvou quando disponível; NULL é honesto e o
    -- painel sabe pular ponto sem valor. Nunca inventar número aqui.
    NULLIF(NEW.cv_data->>'completude', '')::smallint,
    CASE WHEN TG_OP = 'INSERT' THEN 'primeira_versao' ELSE 'edicao' END
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Histórico é observabilidade, não o produto: se falhar, o salvamento do
  -- currículo — que é o que a pessoa está esperando — não pode cair junto.
  RAISE WARNING 'registrar_versao_cv falhou para %: %', NEW.user_id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cv_saves_history ON public.cv_saves;
CREATE TRIGGER trg_cv_saves_history
  AFTER INSERT OR UPDATE ON public.cv_saves
  FOR EACH ROW EXECUTE FUNCTION public.registrar_versao_cv();

COMMIT;
