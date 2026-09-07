-- 039_ciclo_mensal_planos_longos.sql — a cota mensal volta a ser mensal para
-- quem paga trimestral ou anual.
--
-- O BUG
-- check_and_increment_analyses (migração 034) zerava o contador quando
-- analyses_reset_at < current_period_start. Isso funciona no plano mensal, em
-- que o período do Stripe vira todo mês. Mas current_period_start é o início do
-- período de COBRANÇA: no Pro trimestral (vendido hoje no painel a R$29,90/mês)
-- ele só avança a cada 3 meses; nos planos anuais, a cada 12. O contador
-- portanto zerava uma vez por trimestre — o assinante trimestral recebia 100
-- análises por TRIMESTRE, não 100 por mês, e quem gastasse a cota no primeiro
-- mês ficava bloqueado nos dois seguintes, pagando em dia.
--
-- O que tornava isso pior: cartas e treinos (lib/cotas.js) já rolavam o período
-- mês a mês e zeravam certo, e api/subscription.js monta o "zera em DD/MM" do
-- painel com esse mesmo cálculo mensal. O assinante via a data prometida
-- chegar, via os outros dois medidores zerarem, e o de análises seguia em
-- 100/100.
--
-- A CORREÇÃO
-- A âncora do ciclo passa a ser current_period_start ROLADO mês a mês até o mês
-- corrente, que é exatamente o que lib/cotas.js faz. No plano mensal a rolagem
-- é no-op (o próximo mês ainda está no futuro), então nada muda para quem já
-- estava correto. Sem período conhecido, continua caindo no mês de calendário.
--
-- Efeito na primeira execução após o deploy: assinantes trimestrais/anuais cujo
-- contador estava travado zeram na próxima análise — que é a cota que eles já
-- tinham comprado.

BEGIN;

-- ── Âncora do ciclo mensal ────────────────────────────────────────────────
-- Espelho SQL de inicioDoCiclo() em lib/cotas.js. IMMUTABLE não serve porque
-- depende de now(); STABLE basta e permite uso em queries.
--
-- A soma é sempre feita a partir da data original (p + n meses), nunca somando
-- um mês de cada vez sobre o resultado anterior: `+ interval '1 month'` já
-- trunca 31/01 para 28/02, e iterar acumularia essa perda a cada virada.
CREATE OR REPLACE FUNCTION public.inicio_do_ciclo_mensal(p_period_start TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_meses  INTEGER;
  v_ancora TIMESTAMPTZ;
BEGIN
  IF p_period_start IS NULL THEN
    RETURN date_trunc('month', now());
  END IF;

  -- Meses de calendário decorridos entre o início do período e agora.
  v_meses := (EXTRACT(YEAR FROM now())::INT * 12 + EXTRACT(MONTH FROM now())::INT)
           - (EXTRACT(YEAR FROM p_period_start)::INT * 12 + EXTRACT(MONTH FROM p_period_start)::INT);
  IF v_meses < 0 THEN
    v_meses := 0;
  END IF;

  v_ancora := p_period_start + make_interval(months => v_meses);

  -- A âncora deste mês pode ainda não ter chegado (ciclo que vira dia 20 e hoje
  -- é dia 5): nesse caso o ciclo em curso começou no mês anterior.
  IF v_ancora > now() THEN
    v_ancora := p_period_start + make_interval(months => v_meses - 1);
  END IF;

  RETURN v_ancora;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.inicio_do_ciclo_mensal(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.inicio_do_ciclo_mensal(TIMESTAMPTZ) TO service_role;

-- ── RPC de análises: só muda a condição de reset ──────────────────────────
-- Corpo idêntico ao da migração 034 (FOR UPDATE, tetos, estorno) exceto pelo
-- bloco de reset. Recriada inteira porque CREATE OR REPLACE FUNCTION exige o
-- corpo completo.
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

  /* Reset no virar do ciclo. Uma condição só, para os dois planos e para
     qualquer periodicidade de cobrança: zera quando o último reset é anterior
     ao início do ciclo MENSAL corrente. inicio_do_ciclo_mensal cobre também a
     assinatura sem current_period_start (cai no mês de calendário), que era o
     terceiro ramo da versão anterior. */
  IF v_sub.analyses_reset_at IS NULL
     OR v_sub.analyses_reset_at < public.inicio_do_ciclo_mensal(v_sub.current_period_start) THEN
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

COMMIT;
