-- 034_tetos_pro.sql — o Pro deixa de ser "ilimitado" e passa a ter teto medido
--
-- POR QUE
-- O Pro era vendido como ilimitado em análises, cartas e treinos. Num produto
-- de IA isso é custo variável vendido a preço fixo: R$ 39,90 viram R$ 37,92
-- depois do Stripe, e cada análise custa ~R$ 0,078, cada carta ~R$ 0,065 e cada
-- treino ~R$ 0,159. Bastavam ~486 análises num mês para um único assinante
-- zerar a própria mensalidade — e nada no sistema impedia isso.
--
-- Os tetos (100 análises / 50 cartas / 15 treinos) foram escolhidos contra o uso
-- real medido, não por chute. Nenhuma conta existente chega perto deles. Eles
-- existem para o pior caso não virar prejuízo, não para serem alcançados.
--
-- Cartas e treinos são contados por count(*) em cover_letters/interview_sessions
-- (migração 026), que já têm user_id + created_at — não precisam de coluna nova.
-- Só análises têm contador, porque é o único que já existia.
--
-- ALERTAS
-- max_alertas_do_plano cai de 10 para 5 no Pro. Não é corte de recurso: o cron
-- roda uma vez por dia e entrega no máximo 5 perfis por usuário por rodada
-- (TETO_ALERTAS_POR_USUARIO em api/send-alerts.js), então os alertas 6 a 10
-- nunca foram diários de verdade — rodiziavam a cada ~3 dias enquanto a página
-- dizia "10 alertas diários". 5 é o número que o sistema entrega todo dia.

BEGIN;

-- ── 1. Análises: teto do Pro dentro da RPC atômica ────────────────────────
-- Esta é a trava de verdade: FOR UPDATE segura a linha, então duas requisições
-- simultâneas no limite não passam as duas. O espelho em JS
-- (checkSubscriptionDirect, api/analyze.js) só age quando a RPC está fora do ar.
CREATE OR REPLACE FUNCTION check_and_increment_analyses(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub          RECORD;
  v_new_count    INTEGER;
  v_cap          INTEGER;
  v_starter_cap  CONSTANT INTEGER := 10;
  v_pro_cap      CONSTANT INTEGER := 100;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'null_user_id');
  END IF;

  SELECT *
  INTO v_sub
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trialing', 'past_due')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'via', 'no_subscription');
  END IF;

  IF v_sub.plan NOT IN ('starter', 'pro') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_plan', 'plan', v_sub.plan);
  END IF;

  v_cap := CASE v_sub.plan WHEN 'pro' THEN v_pro_cap ELSE v_starter_cap END;

  /* Reset no virar do ciclo. Mesma regra para os dois planos: a data que a
     pessoa vê no painel como "renova em" é a mesma que zera a conta.

     O terceiro ramo (current_period_start IS NULL) nao existia e era um bug
     latente: assinatura sem periodo do Stripe — a unica Pro em producao esta
     assim — nunca satisfazia nenhuma das duas condicoes, entao o contador
     jamais zerava. Sem teto isso era inofensivo, porque ninguem lia o contador.
     Com teto de 100, seria porta de mao unica: gasta as 100 e fica bloqueado
     para sempre. Sem periodo conhecido, o ciclo passa a ser o mes do
     calendario, igual ao que lib/cotas.js faz para cartas e treinos. */
  IF v_sub.analyses_reset_at IS NULL
     OR (v_sub.current_period_start IS NOT NULL
         AND v_sub.analyses_reset_at < v_sub.current_period_start)
     OR (v_sub.current_period_start IS NULL
         AND v_sub.analyses_reset_at < date_trunc('month', now())) THEN
    UPDATE subscriptions
    SET analyses_used_this_month = 0,
        analyses_reset_at = NOW()
    WHERE id = v_sub.id;
    v_sub.analyses_used_this_month := 0;
  END IF;

  IF v_sub.analyses_used_this_month >= v_cap THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'plan_limit',
      'plan', v_sub.plan,
      'used', v_sub.analyses_used_this_month,
      'limit', v_cap
    );
  END IF;

  UPDATE subscriptions
  SET analyses_used_this_month = analyses_used_this_month + 1
  WHERE id = v_sub.id
  RETURNING analyses_used_this_month INTO v_new_count;

  RETURN jsonb_build_object(
    'ok', true,
    'via', v_sub.plan,
    'plan', v_sub.plan,
    'used', v_new_count,
    'limit', v_cap
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION check_and_increment_analyses(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION check_and_increment_analyses(UUID) TO service_role;

-- ── 2. Estorno passa a valer para o Pro ───────────────────────────────────
-- Antes o Pro não tinha cota, então falha de IA não devolvia nada. Agora tem:
-- se a análise não foi entregue, ela não pode contar. past_due entra na lista
-- porque é status pago em lib/entitlements.js — e quem está em período de graça
-- é justamente quem não pode perder uma análise por erro nosso.
CREATE OR REPLACE FUNCTION decrement_analyses_used(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_rows_updated INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'null_user_id');
  END IF;

  UPDATE subscriptions
  SET analyses_used_this_month = GREATEST(0, analyses_used_this_month - 1)
  WHERE user_id = p_user_id
    AND plan IN ('starter', 'pro')
    AND status IN ('active', 'trialing', 'past_due')
    AND analyses_used_this_month > 0;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated > 0 THEN
    RETURN jsonb_build_object('ok', true, 'rows', v_rows_updated);
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'no_eligible_subscription');
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION decrement_analyses_used(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION decrement_analyses_used(UUID) TO service_role;

-- ── 3. Alertas: Pro de 10 para 5 ──────────────────────────────────────────
-- Espelha ENTITLEMENTS de lib/entitlements.js; os dois números são comparados
-- por teste (tests/integridade.test.js) para não divergirem em silêncio.
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

  IF v_plan IS NULL
     OR v_status IS NULL
     OR v_status NOT IN ('active', 'trialing', 'past_due')
     OR v_plan NOT IN ('starter', 'pro')
  THEN
    RETURN 1;
  END IF;

  RETURN CASE v_plan WHEN 'pro' THEN 5 WHEN 'starter' THEN 3 ELSE 1 END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.max_alertas_do_plano(uuid) FROM PUBLIC, anon, authenticated;

-- ── 4. Quem já passou do novo teto de alertas ─────────────────────────────
-- Desativa o excedente sem apagar, mantendo ativos os usados mais recentemente
-- (aplicar_limite_alertas, migração 025). O trigger só barra alerta NOVO; sem
-- isto, quem já tinha 6 a 10 continuaria com todos ativos indefinidamente.
DO $do$
DECLARE
  r       RECORD;
  v_total integer := 0;
  v_n     integer;
BEGIN
  FOR r IN
    SELECT user_id
      FROM public.job_alert_profiles
     WHERE ativo IS TRUE
     GROUP BY user_id
    HAVING count(*) > 5
  LOOP
    v_n := public.aplicar_limite_alertas(r.user_id);
    v_total := v_total + v_n;
  END LOOP;
  RAISE NOTICE '034: % alerta(s) excedente(s) desativado(s)', v_total;
END;
$do$;

-- ── 5. Contador do Pro começa limpo ───────────────────────────────────────
-- Até aqui o Pro nunca incrementou analyses_used_this_month (a RPC saía antes).
-- Se alguma linha carrega valor antigo de quando a conta era Starter, ela
-- viraria consumo fantasma no primeiro dia do teto novo.
-- Caso real encontrado antes de aplicar: a assinatura Pro existente estava com
-- 46 no contador (residuo de quando o numero nao era lido por ninguem) e
-- current_period_start NULL. Sem este UPDATE, o teto de 100 comecaria valendo
-- com 46 ja gastos, sem que nada tivesse sido consumido sob a regra nova.
UPDATE public.subscriptions
   SET analyses_used_this_month = 0,
       analyses_reset_at = NOW()
 WHERE plan = 'pro'
   AND status IN ('active', 'trialing', 'past_due')
   AND COALESCE(analyses_used_this_month, 0) > 0;

COMMIT;
