-- 000_baseline.sql — as tabelas que nasceram fora do versionamento
--
-- NÃO RODE ESTA MIGRAÇÃO NO BANCO DE PRODUÇÃO. Ela é idempotente
-- (CREATE TABLE IF NOT EXISTS) e não faria estrago, mas o propósito dela é
-- documentar, não migrar: o banco de produção já tem tudo isto.
--
-- Por que existe: sete tabelas em uso não têm migração em migrations/ —
-- user_credits, webhook_events, job_alert_sent, user_milestones,
-- analysis_cache, email_leads e blog_posts. Foram criadas direto pelo painel
-- do Supabase. Consequência prática: quem reconstruir o schema a partir deste
-- repositório monta um banco que não roda o produto, e nenhuma delas passou
-- por revisão de código — que estejam corretas hoje foi verificado numa
-- auditoria, não garantido pelo processo.
--
-- O nome é 000 de propósito: numerada assim, ela ordena antes de tudo e não
-- entra na sequência de migrações a aplicar.
--
-- Reconstruído a partir de information_schema em 23/08/2026. As políticas de
-- RLS e os grants de cada uma estão nas migrações 015, 016, 020 e 030 —
-- aqui ficam só a estrutura e a intenção de cada tabela.

BEGIN;

-- Saldo de créditos avulsos. Escrita SÓ pelo servidor: a migração 016 revogou
-- INSERT/UPDATE/DELETE de anon e authenticated justamente aqui, e foi o
-- precedente que a 030 estendeu para o resto do banco.
CREATE TABLE IF NOT EXISTS public.user_credits (
  user_id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  credits         integer NOT NULL DEFAULT 0,
  total_purchased integer NOT NULL DEFAULT 0,
  updated_at      timestamptz DEFAULT now()
);

-- Idempotência do webhook do Stripe: stripe_session_id é a chave que impede
-- creditar duas vezes o mesmo pagamento quando o Stripe reenvia o evento.
-- user_id é ON DELETE SET NULL desde a migração 029 — evento de cobrança é
-- registro contábil e sobrevive à exclusão da conta, sem o vínculo pessoal.
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id text NOT NULL UNIQUE,
  user_id           uuid,
  amount            integer,
  processed_at      timestamptz DEFAULT now()
);

-- Deduplicação de vagas já enviadas, por usuário. job_hash identifica o
-- anúncio; dismissed_reason guarda por que a pessoa descartou a recomendação —
-- é o único feedback explícito que o radar recebe.
CREATE TABLE IF NOT EXISTS public.job_alert_sent (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  job_hash         text NOT NULL,
  job_title        text,
  job_company      text,
  job_url          text,
  sent_at          timestamptz DEFAULT now(),
  dismissed_reason text,
  dismissed_at     timestamptz
);

-- Marcos de gamificação já concedidos, para não conceder duas vezes.
CREATE TABLE IF NOT EXISTS public.user_milestones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone       integer NOT NULL,
  credits_awarded integer NOT NULL DEFAULT 0,
  awarded_at      timestamptz DEFAULT now()
);

-- Cache de análise, chaveado por sha256(currículo + vaga) truncado em 160 bits.
-- user_id e created_at vieram na migração 029: até ela, era dado derivado de
-- currículo guardado sem dono e sem prazo.
CREATE TABLE IF NOT EXISTS public.analysis_cache (
  hash       text PRIMARY KEY,
  result     jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Captura de e-mail da landing page. anon insere (com validação de formato na
-- própria política); ler a lista nunca foi função do navegador.
CREATE TABLE IF NOT EXISTS public.email_leads (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  source     text DEFAULT 'app_result'::text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Blog. Única tabela do banco com leitura pública (anon lê onde published =
-- true); escrita é de quem está em public.admins, via a função e_admin().
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL DEFAULT ''::text,
  slug       text NOT NULL UNIQUE,
  excerpt    text DEFAULT ''::text,
  content    text DEFAULT ''::text,
  cover_url  text DEFAULT ''::text,
  published  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  seo_title  text DEFAULT ''::text,
  categories text DEFAULT '[]'::text
);

COMMIT;
