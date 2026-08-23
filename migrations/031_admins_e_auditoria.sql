-- 031_admins_e_auditoria.sql — quem é admin, e o que o admin olhou
--
-- Dois problemas do mesmo lugar.
--
-- 1. A lista de administradores vive em dois lugares: dentro da política
--    blog_admin_all (e-mails escritos no SQL) e em api/admin.js (ADMIN_EMAILS).
--    Tirar alguém do time exige lembrar dos dois, e um esquecimento deixa
--    acesso ativo.
--
-- 2. O painel administrativo lê até 500 análises com o `result` completo — o
--    conteúdo de currículo de clientes reais — e remove usuários, sem deixar
--    nenhum registro. Não há como responder "quem olhou o quê, e quando", nem
--    para um cliente que pergunte, nem para você mesmo.
--
-- ORDEM DE APLICAÇÃO: esta migração precisa rodar ANTES do deploy do
-- api/admin.js que a acompanha. O endpoint passa a consultar public.admins e
-- falha fechado se a tabela não existir — o que é o comportamento correto para
-- um controle de acesso, mas significa que aplicar fora de ordem tira o seu
-- próprio acesso ao painel até a migração rodar.

BEGIN;

-- ── Quem é admin ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admins (
  email      text PRIMARY KEY,
  nota       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.admins (email, nota) VALUES
  ('contato@vagaai.app.br', 'conta institucional'),
  ('jvhr96@gmail.com',      'fundador')
ON CONFLICT (email) DO NOTHING;

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
-- Sem política: ninguém lê pelo PostgREST. Quem consulta é a service_role (no
-- servidor) e a política de blog_posts (via função abaixo).
REVOKE ALL ON public.admins FROM anon, authenticated;

-- Função usada pela política. STABLE para o planner reaproveitar dentro da
-- mesma query; SECURITY DEFINER porque public.admins não é legível por
-- authenticated — e é exatamente assim que deve ser.
CREATE OR REPLACE FUNCTION public.e_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins a
     WHERE a.email = ((SELECT auth.jwt()) ->> 'email')
  );
$$;

GRANT EXECUTE ON FUNCTION public.e_admin() TO authenticated;

-- blog_posts passa a perguntar à tabela em vez de carregar a lista no SQL.
DROP POLICY IF EXISTS blog_admin_all ON public.blog_posts;
CREATE POLICY blog_admin_all ON public.blog_posts
  FOR ALL TO authenticated
  USING (public.e_admin())
  WITH CHECK (public.e_admin());

-- ── O que o admin olhou ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_audit (
  id          bigserial PRIMARY KEY,
  admin_email text NOT NULL,
  acao        text NOT NULL,   -- 'listar_usuarios', 'ler_analises', 'remover_usuario', 'ajustar_creditos'
  alvo        text,            -- user_id afetado, quando a ação é sobre uma pessoa
  detalhe     jsonb,           -- quantidade lida, créditos somados — nunca conteúdo
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_created_idx
  ON public.admin_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_alvo_idx
  ON public.admin_audit (alvo, created_at DESC);

ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;
-- Sem política: só a service_role escreve e lê. Trilha de auditoria que o
-- navegador pudesse alterar não é trilha de auditoria.
REVOKE ALL ON public.admin_audit FROM anon, authenticated;

COMMIT;
