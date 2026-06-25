-- Migration 018: keep analysis entitlement RPC aligned with /api/subscription.
-- past_due is a paid grace-period status in lib/entitlements.js, so Pro users
-- in that state must keep unlimited analysis access.

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

  IF v_sub.status NOT IN ('active', 'trialing', 'past_due') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'inactive_subscription', 'status', v_sub.status);
  END IF;

  IF v_sub.plan = 'pro' THEN
    RETURN jsonb_build_object('ok', true, 'via', 'pro', 'plan', 'pro');
  END IF;

  IF v_sub.plan = 'starter' THEN
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

  RETURN jsonb_build_object('ok', false, 'reason', 'invalid_plan', 'plan', v_sub.plan);
END;
$$;

REVOKE EXECUTE ON FUNCTION check_and_increment_analyses(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION check_and_increment_analyses(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION check_and_increment_analyses(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION check_and_increment_analyses(UUID) TO service_role;
