-- Migration 007: check_and_increment_analyses — atomic RPC for analyze.js
-- Checks plan entitlement and increments quota in one transaction.
-- Handles Pro (unlimited), Starter (monthly cap), and no-subscription paths.
-- Resets monthly counter when a new billing cycle starts.

DROP FUNCTION IF EXISTS check_and_increment_analyses(UUID);

CREATE OR REPLACE FUNCTION check_and_increment_analyses(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub          RECORD;
  v_new_count    INTEGER;
  v_starter_cap  CONSTANT INTEGER := 10;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'null_user_id');
  END IF;

  -- Lock the subscription row to prevent concurrent increments
  SELECT *
  INTO v_sub
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trialing', 'past_due')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  -- No active subscription → caller falls through to credits / free-monthly path
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'via', 'no_subscription');
  END IF;

  -- Inactive / bad status guard (belt-and-suspenders)
  IF v_sub.status NOT IN ('active', 'trialing', 'past_due') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'inactive_subscription', 'status', v_sub.status);
  END IF;

  -- ── Pro plan: unlimited ───────────────────────────────────────────────────────
  IF v_sub.plan = 'pro' THEN
    RETURN jsonb_build_object('ok', true, 'via', 'pro', 'plan', 'pro');
  END IF;

  -- ── Starter plan: monthly quota ───────────────────────────────────────────────
  IF v_sub.plan = 'starter' THEN
    -- Reset counter when billing cycle has rolled over
    IF v_sub.analyses_reset_at IS NULL OR
       (v_sub.current_period_start IS NOT NULL AND v_sub.analyses_reset_at < v_sub.current_period_start) THEN
      UPDATE subscriptions
      SET analyses_used_this_month = 0,
          analyses_reset_at = NOW()
      WHERE id = v_sub.id;
      v_sub.analyses_used_this_month := 0;
    END IF;

    IF v_sub.analyses_used_this_month >= v_starter_cap THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'plan_limit',
        'plan', 'starter',
        'used', v_sub.analyses_used_this_month,
        'limit', v_starter_cap
      );
    END IF;

    UPDATE subscriptions
    SET analyses_used_this_month = analyses_used_this_month + 1
    WHERE id = v_sub.id
    RETURNING analyses_used_this_month INTO v_new_count;

    RETURN jsonb_build_object(
      'ok', true,
      'via', 'starter',
      'plan', 'starter',
      'used', v_new_count,
      'limit', v_starter_cap
    );
  END IF;

  -- Unknown plan value
  RETURN jsonb_build_object('ok', false, 'reason', 'invalid_plan', 'plan', v_sub.plan);
END;
$$;

REVOKE EXECUTE ON FUNCTION check_and_increment_analyses(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION check_and_increment_analyses(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION check_and_increment_analyses(UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION check_and_increment_analyses(UUID) TO service_role;
