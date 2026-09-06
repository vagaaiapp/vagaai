-- 038_ai_budget_guard.sql
-- Reserva atomica de orcamento antes de qualquer chamada de IA.
-- Evita que rajadas concorrentes ultrapassem os tetos economicos entre lambdas.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_budget_reservations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_key       text CHECK (subject_key IS NULL OR char_length(subject_key) BETWEEN 3 AND 160),
  endpoint          text NOT NULL CHECK (char_length(endpoint) BETWEEN 1 AND 80),
  action            text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 80),
  reserved_cost_usd numeric(14,8) NOT NULL CHECK (reserved_cost_usd > 0 AND reserved_cost_usd <= 10),
  actual_cost_usd   numeric(14,8) CHECK (actual_cost_usd >= 0 AND actual_cost_usd <= 10),
  status            text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'settled', 'released')),
  reason            text,
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  settled_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_budget_reservations_created_idx
  ON public.ai_budget_reservations(created_at DESC);
CREATE INDEX IF NOT EXISTS ai_budget_reservations_subject_created_idx
  ON public.ai_budget_reservations(subject_key, created_at DESC)
  WHERE subject_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_budget_reservations_open_idx
  ON public.ai_budget_reservations(expires_at)
  WHERE status = 'reserved';

ALTER TABLE public.ai_budget_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_budget_reservations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ai_budget_reservations TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_ai_budget(
  p_subject_key text,
  p_endpoint text,
  p_action text,
  p_estimated_cost_usd numeric,
  p_subject_daily_limit_usd numeric,
  p_subject_monthly_limit_usd numeric,
  p_global_hourly_limit_usd numeric,
  p_global_daily_limit_usd numeric,
  p_max_concurrent integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
  v_subject_day numeric := 0;
  v_subject_month numeric := 0;
  v_global_hour numeric := 0;
  v_global_day numeric := 0;
  v_concurrent integer := 0;
BEGIN
  IF p_endpoint IS NULL OR char_length(p_endpoint) NOT BETWEEN 1 AND 80
     OR p_action IS NULL OR char_length(p_action) NOT BETWEEN 1 AND 80
     OR p_estimated_cost_usd IS NULL OR p_estimated_cost_usd <= 0 OR p_estimated_cost_usd > 10
     OR p_subject_daily_limit_usd <= 0 OR p_subject_monthly_limit_usd <= 0
     OR p_global_hourly_limit_usd <= 0 OR p_global_daily_limit_usd <= 0
     OR p_max_concurrent NOT BETWEEN 1 AND 20 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_budget_request');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ai-budget:global', 0));
  IF p_subject_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('ai-budget:' || p_subject_key, 0));
  END IF;

  UPDATE public.ai_budget_reservations
     SET status = 'released', reason = 'expired', settled_at = now()
   WHERE status = 'reserved' AND expires_at <= now();

  SELECT coalesce(sum(coalesce(actual_cost_usd, reserved_cost_usd)), 0)
    INTO v_global_hour
    FROM public.ai_budget_reservations
   WHERE created_at >= now() - interval '1 hour'
     AND (status = 'settled' OR (status = 'reserved' AND expires_at > now()));

  SELECT coalesce(sum(coalesce(actual_cost_usd, reserved_cost_usd)), 0)
    INTO v_global_day
    FROM public.ai_budget_reservations
   WHERE created_at >= now() - interval '24 hours'
     AND (status = 'settled' OR (status = 'reserved' AND expires_at > now()));

  IF v_global_hour + p_estimated_cost_usd > p_global_hourly_limit_usd THEN
    INSERT INTO public.ai_budget_reservations(subject_key,endpoint,action,reserved_cost_usd,status,reason,settled_at)
    VALUES(p_subject_key,p_endpoint,p_action,p_estimated_cost_usd,'released','global_hourly_budget',now());
    RETURN jsonb_build_object('ok', false, 'reason', 'global_hourly_budget', 'current_usd', v_global_hour);
  END IF;
  IF v_global_day + p_estimated_cost_usd > p_global_daily_limit_usd THEN
    INSERT INTO public.ai_budget_reservations(subject_key,endpoint,action,reserved_cost_usd,status,reason,settled_at)
    VALUES(p_subject_key,p_endpoint,p_action,p_estimated_cost_usd,'released','global_daily_budget',now());
    RETURN jsonb_build_object('ok', false, 'reason', 'global_daily_budget', 'current_usd', v_global_day);
  END IF;

  IF p_subject_key IS NOT NULL THEN
    SELECT coalesce(sum(coalesce(actual_cost_usd, reserved_cost_usd)), 0)
      INTO v_subject_day
      FROM public.ai_budget_reservations
     WHERE subject_key = p_subject_key
       AND created_at >= now() - interval '24 hours'
       AND (status = 'settled' OR (status = 'reserved' AND expires_at > now()));

    SELECT coalesce(sum(coalesce(actual_cost_usd, reserved_cost_usd)), 0)
      INTO v_subject_month
      FROM public.ai_budget_reservations
     WHERE subject_key = p_subject_key
       AND created_at >= date_trunc('month', now())
       AND (status = 'settled' OR (status = 'reserved' AND expires_at > now()));

    SELECT count(*) INTO v_concurrent
      FROM public.ai_budget_reservations
     WHERE subject_key = p_subject_key AND status = 'reserved' AND expires_at > now();

    IF v_concurrent >= p_max_concurrent THEN
      INSERT INTO public.ai_budget_reservations(subject_key,endpoint,action,reserved_cost_usd,status,reason,settled_at)
      VALUES(p_subject_key,p_endpoint,p_action,p_estimated_cost_usd,'released','subject_concurrency',now());
      RETURN jsonb_build_object('ok', false, 'reason', 'subject_concurrency', 'concurrent', v_concurrent);
    END IF;
    IF v_subject_day + p_estimated_cost_usd > p_subject_daily_limit_usd THEN
      INSERT INTO public.ai_budget_reservations(subject_key,endpoint,action,reserved_cost_usd,status,reason,settled_at)
      VALUES(p_subject_key,p_endpoint,p_action,p_estimated_cost_usd,'released','subject_daily_budget',now());
      RETURN jsonb_build_object('ok', false, 'reason', 'subject_daily_budget', 'current_usd', v_subject_day);
    END IF;
    IF v_subject_month + p_estimated_cost_usd > p_subject_monthly_limit_usd THEN
      INSERT INTO public.ai_budget_reservations(subject_key,endpoint,action,reserved_cost_usd,status,reason,settled_at)
      VALUES(p_subject_key,p_endpoint,p_action,p_estimated_cost_usd,'released','subject_monthly_budget',now());
      RETURN jsonb_build_object('ok', false, 'reason', 'subject_monthly_budget', 'current_usd', v_subject_month);
    END IF;
  END IF;

  INSERT INTO public.ai_budget_reservations(subject_key, endpoint, action, reserved_cost_usd)
  VALUES (p_subject_key, p_endpoint, p_action, p_estimated_cost_usd)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'reservation_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_ai_budget(p_reservation_id uuid, p_actual_cost_usd numeric)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_rows integer;
BEGIN
  UPDATE public.ai_budget_reservations
     SET status = 'settled',
         actual_cost_usd = greatest(0, least(coalesce(p_actual_cost_usd, reserved_cost_usd), 10)),
         settled_at = now()
   WHERE id = p_reservation_id AND status = 'reserved';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_ai_budget(p_reservation_id uuid, p_reason text DEFAULT 'provider_failure')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_rows integer;
BEGIN
  UPDATE public.ai_budget_reservations
     SET status = 'released', reason = left(coalesce(p_reason, 'released'), 120), settled_at = now()
   WHERE id = p_reservation_id AND status = 'reserved';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_budget_summary(p_days integer DEFAULT 30)
RETURNS TABLE (
  status text,
  reason text,
  reservations bigint,
  estimated_cost_usd numeric,
  actual_cost_usd numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT r.status,
         coalesce(r.reason, '') AS reason,
         count(*)::bigint AS reservations,
         coalesce(sum(r.reserved_cost_usd), 0)::numeric AS estimated_cost_usd,
         coalesce(sum(r.actual_cost_usd), 0)::numeric AS actual_cost_usd
    FROM public.ai_budget_reservations r
   WHERE r.created_at >= now() - make_interval(days => greatest(1, least(p_days, 365)))
   GROUP BY r.status, coalesce(r.reason, '')
   ORDER BY count(*) DESC;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_budget(text,text,text,numeric,numeric,numeric,numeric,numeric,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_ai_budget(uuid,numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_ai_budget(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_budget_summary(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_budget(text,text,text,numeric,numeric,numeric,numeric,numeric,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_ai_budget(uuid,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ai_budget(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_budget_summary(integer) TO service_role;

COMMIT;
