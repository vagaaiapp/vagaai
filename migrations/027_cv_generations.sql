-- 027_cv_generations.sql — a tabela que o código gravava e não existia
--
-- api/analyze.js registra cada currículo criado do zero em public.cv_generations.
-- A tabela nunca foi criada: `select to_regclass('public.cv_generations')` devolve
-- null. O PostgREST responde 404, e como 404 é uma resposta HTTP válida a promessa
-- do fetch RESOLVE — o `.catch()` do call site nunca dispara e nem o console.error
-- aparece. Toda geração de currículo do zero deixava de ser registrada em silêncio
-- absoluto, e esse insert é o único lugar que mede o uso da funcionalidade.
--
-- Vale para toda telemetria fire-and-forget: `.catch()` sozinho só pega falha de
-- rede. O call site passou a checar `res.ok` junto com esta migração.

BEGIN;

CREATE TABLE IF NOT EXISTS public.cv_generations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Plano no momento da geração: o mesmo usuário gera no free e depois no pro,
  -- e a pergunta que interessa é qual plano gera mais.
  plan       text,
  -- Como o crédito foi debitado (assinatura, crédito avulso, cortesia).
  via        text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cv_generations_user_idx
  ON public.cv_generations (user_id, created_at DESC);

-- Mesma postura das demais tabelas de usuário: RLS ligada, dono lê o que é seu,
-- e só a service_role escreve (quem insere é o servidor, em api/analyze.js).
ALTER TABLE public.cv_generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cv_generations_read_own ON public.cv_generations;
CREATE POLICY cv_generations_read_own ON public.cv_generations
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.cv_generations FROM anon, authenticated;

COMMIT;
