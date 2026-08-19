-- 025_multi_alerta.sql — Fase 2: mais de um alerta por conta
--
-- job_alert_profiles nasceu com PRIMARY KEY (user_id), o que trava a conta em um
-- perfil só. O Pro era anunciado como "alertas ilimitados" e entregava um; a
-- landing foi corrigida em c1c3f20 para prometer o que existia, e esta migração
-- destrava o recurso de verdade.
--
-- O cron já estava pronto: send-alerts.js consulta uma LISTA de perfis vencidos
-- e chama processUserAlert(profile) por perfil, em lotes paralelos de 5. Só a
-- chave primária impedia que existisse mais de um.
--
-- Limite por plano é aplicado por TRIGGER, não só no cliente: a policy de RLS
-- é FOR ALL com auth.uid() = user_id, então o navegador consegue inserir direto
-- via PostgREST. Sem trigger, qualquer conta gratuita criaria 50 alertas.

BEGIN;

-- ── 1. job_alert_profiles: PK user_id → id ────────────────────────────────
ALTER TABLE public.job_alert_profiles
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.job_alert_profiles DROP CONSTRAINT job_alert_profiles_pkey;
ALTER TABLE public.job_alert_profiles ADD PRIMARY KEY (id);

-- Toda consulta do produto filtra por dono; sem a PK, o índice precisa existir.
CREATE INDEX IF NOT EXISTS job_alert_profiles_user_idx
  ON public.job_alert_profiles (user_id);

-- O cron varre por vencimento entre TODOS os perfis ativos.
CREATE INDEX IF NOT EXISTS job_alert_profiles_fila_idx
  ON public.job_alert_profiles (next_run_at NULLS FIRST) WHERE ativo IS TRUE;

-- Com vários alertas a pessoa precisa distinguir "Vendedora SP" de "Atendente SP".
ALTER TABLE public.job_alert_profiles ADD COLUMN IF NOT EXISTS nome text;

-- ── 2. job_alert_cache: uma linha por alerta ──────────────────────────────
-- O cache guarda as vagas exibidas no painel e é lido-modificado-gravado a cada
-- envio. Com dois alertas do mesmo usuário no mesmo lote paralelo, os dois
-- escreveriam na mesma linha e um sobrescreveria a mesclagem do outro. Separar
-- por alerta elimina a corrida e ainda permite dizer de qual alerta veio a vaga.
ALTER TABLE public.job_alert_cache ADD COLUMN IF NOT EXISTS alert_id uuid;

UPDATE public.job_alert_cache c
   SET alert_id = p.id
  FROM public.job_alert_profiles p
 WHERE p.user_id = c.user_id AND c.alert_id IS NULL;

-- Cache sem perfil correspondente não tem a quem pertencer.
DELETE FROM public.job_alert_cache WHERE alert_id IS NULL;

ALTER TABLE public.job_alert_cache ALTER COLUMN alert_id SET NOT NULL;
ALTER TABLE public.job_alert_cache DROP CONSTRAINT job_alert_cache_pkey;
ALTER TABLE public.job_alert_cache ADD PRIMARY KEY (user_id, alert_id);
ALTER TABLE public.job_alert_cache
  ADD CONSTRAINT job_alert_cache_alert_fkey
  FOREIGN KEY (alert_id) REFERENCES public.job_alert_profiles(id) ON DELETE CASCADE;

-- ── 3. job_alert_history: a coluna já existia, faltava o vínculo ──────────
ALTER TABLE public.job_alert_history
  ADD CONSTRAINT job_alert_history_alert_fkey
  FOREIGN KEY (alert_id) REFERENCES public.job_alert_profiles(id) ON DELETE SET NULL;

-- ── 4. Limite de alertas ativos por plano ─────────────────────────────────
-- Espelha ENTITLEMENTS de lib/entitlements.js. Os dois números são verificados
-- por teste (tests/integridade.test.js) para não divergirem em silêncio.
--
-- Pro tem teto de 10, não "ilimitado": cada alerta consulta 20 fontes de vaga e
-- passa por re-ranking de IA, e a frequência do Pro é diária. Ilimitado é custo
-- sem teto num plano de preço fixo.
CREATE OR REPLACE FUNCTION public.max_alertas_do_plano(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_plan text;
  v_status text;
BEGIN
  SELECT plan, status INTO v_plan, v_status
    FROM public.subscriptions
   WHERE user_id = p_user_id
   ORDER BY created_at DESC
   LIMIT 1;

  -- Mesma regra de resolvePlan() em lib/entitlements.js: plano pago só vale
  -- com status pago; qualquer outro caso cai para free.
  IF v_plan IS NULL
     OR v_status IS NULL
     OR v_status NOT IN ('active', 'trialing', 'past_due')
     OR v_plan NOT IN ('starter', 'pro')
  THEN
    RETURN 1;
  END IF;

  RETURN CASE v_plan WHEN 'pro' THEN 10 WHEN 'starter' THEN 3 ELSE 1 END;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_max_active_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_max   integer;
  v_ativos integer;
BEGIN
  -- Desativar e editar alerta inativo nunca esbarram no limite.
  IF NEW.ativo IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Editar um alerta que já estava ativo também não: a contagem não muda.
  IF TG_OP = 'UPDATE' AND OLD.ativo IS TRUE THEN
    RETURN NEW;
  END IF;

  v_max := public.max_alertas_do_plano(NEW.user_id);

  SELECT count(*) INTO v_ativos
    FROM public.job_alert_profiles
   WHERE user_id = NEW.user_id
     AND ativo IS TRUE
     AND id <> NEW.id;

  IF v_ativos >= v_max THEN
    RAISE EXCEPTION 'limite_alertas: seu plano permite % alerta(s) ativo(s)', v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_max_active_alerts ON public.job_alert_profiles;
CREATE TRIGGER trg_max_active_alerts
  BEFORE INSERT OR UPDATE OF ativo, user_id ON public.job_alert_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_active_alerts();

-- ── 5. Downgrade: desativa o excedente SEM apagar ─────────────────────────
-- Quem cancela o Pro pode ter 10 alertas e direito a 1. Apagar destruiria o
-- trabalho de configuração; desativar preserva tudo para quando voltar. Mantém
-- ativos os mais recentemente usados — são os que a pessoa acompanha de fato.
CREATE OR REPLACE FUNCTION public.aplicar_limite_alertas(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_max integer;
  v_desativados integer;
BEGIN
  v_max := public.max_alertas_do_plano(p_user_id);

  WITH ranqueados AS (
    SELECT id,
           row_number() OVER (
             ORDER BY last_run_at DESC NULLS LAST, updated_at DESC NULLS LAST, created_at ASC
           ) AS posicao
      FROM public.job_alert_profiles
     WHERE user_id = p_user_id AND ativo IS TRUE
  ), desativa AS (
    UPDATE public.job_alert_profiles p
       SET ativo = false, updated_at = now()
      FROM ranqueados r
     WHERE p.id = r.id AND r.posicao > v_max
     RETURNING p.id
  )
  SELECT count(*) INTO v_desativados FROM desativa;

  RETURN v_desativados;
END;
$$;

-- Regra do projeto: SECURITY DEFINER em public é executável por anon/authenticated
-- via /rest/v1/rpc por padrão. Estas rodam por trigger e pela service key.
REVOKE EXECUTE ON FUNCTION public.max_alertas_do_plano(uuid)   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_max_active_alerts()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aplicar_limite_alertas(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
