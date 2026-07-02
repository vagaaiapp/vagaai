-- Migration 004: REPLACED — see 006_atomic_credit_rpcs.sql
-- This file intentionally does nothing.
-- The original 004 contained a broken function that targeted user_credits.analyses_used_this_month,
-- a column that does not exist. The correct implementation is in 006.
-- Keeping this file as a no-op so migration order stays intact on existing DBs.
SELECT 1; -- no-op
