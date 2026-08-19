-- 026_cartas_e_treinos.sql — carta de apresentação e treino de entrevista viram histórico
--
-- Até aqui as duas ferramentas só geravam e devolviam: cover-letter.js e
-- interview.js não escreviam nada no banco. Quem se candidata a 20 vagas não
-- conseguia reler, comparar ou reaproveitar carta nenhuma, e o treino sumia ao
-- fechar a aba. Era também o motivo de o painel não conseguir mostrar número
-- honesto dessas duas ferramentas — não existia número.
--
-- Dois produtos de cinco viravam descartáveis, num plano vendido como assinatura.

BEGIN;

-- ── Cartas ────────────────────────────────────────────────────────────────
-- A API devolve três textos (carta longa, versão curta e mensagem de
-- abordagem) mais o cruzamento de requisitos citados. Guardamos o que a tela
-- mostra, para reabrir idêntico sem gastar IA de novo.
CREATE TABLE IF NOT EXISTS public.cover_letters (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- A carta sobrevive à análise que a originou: quem arquiva a análise não
  -- perde a carta que já enviou para a empresa.
  analysis_id        uuid REFERENCES public.analyses(id) ON DELETE SET NULL,
  cargo              text,
  empresa            text,
  assunto            text,
  carta              text NOT NULL,
  curta              text,
  mensagem           text,
  requisitos_citados text[] DEFAULT '{}',
  requisitos_total   integer DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cover_letters_user_idx
  ON public.cover_letters (user_id, created_at DESC);

-- ── Treinos de entrevista ─────────────────────────────────────────────────
-- A linha nasce no /api/interview?action=generate e é fechada pelo navegador
-- quando a pessoa termina. Sessão abandonada fica com finished_at NULL de
-- propósito: "você começou um treino e não terminou" é informação útil, e
-- apagá-la esconderia o abandono em vez de tratá-lo.
CREATE TABLE IF NOT EXISTS public.interview_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_id  uuid REFERENCES public.analyses(id) ON DELETE SET NULL,
  cargo        text,
  empresa      text,
  perguntas    jsonb NOT NULL DEFAULT '[]'::jsonb,
  respostas    jsonb NOT NULL DEFAULT '[]'::jsonb,
  nota_media   numeric(3,1),
  respondidas  integer NOT NULL DEFAULT 0,
  total        integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);

CREATE INDEX IF NOT EXISTS interview_sessions_user_idx
  ON public.interview_sessions (user_id, created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Mesmo formato de cv_saves: dono lê e escreve o próprio, e só. A escrita pelo
-- navegador é necessária porque o treino é fechado no cliente, quando a pessoa
-- responde a última pergunta.
ALTER TABLE public.cover_letters      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cover_letters_owner ON public.cover_letters;
CREATE POLICY cover_letters_owner ON public.cover_letters
  FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS interview_sessions_owner ON public.interview_sessions;
CREATE POLICY interview_sessions_owner ON public.interview_sessions
  FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

COMMIT;
