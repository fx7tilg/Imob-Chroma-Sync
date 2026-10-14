-- Retire the per-feature AI credit counter.
--
-- `use_ai_credit` gave every feature its own hidden allowance (3 per day, 5 for
-- ask_ai), hardcoded in the function and identical for every role. It ran only
-- in the browser, before the request reached the AI service, while the real
-- token ledger (ai_credit_plans / ai_usage_events, migration 20260920000000)
-- metered the same call independently.
--
-- Two counters for one action meant the header meter could read "30000 of
-- 30000 tokens remaining" while the button refused to run with "You have
-- exhausted your 3 credits". The token ledger is the system of record: it is
-- enforced server-side, priced per token, and differentiated by role, so the
-- per-feature counter is removed rather than reconciled.
--
-- The table is kept as a read-only record of what was already consumed.

drop function if exists use_ai_credit(text);

comment on table user_feature_credits is
    'Retired by migration 20260922000000. Superseded by ai_usage_events; '
    'kept for historical reference, no longer written to.';
