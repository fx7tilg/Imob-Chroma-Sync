-- Rescale the per-role AI allowances to the reduced $5 LLM budget.
--
-- The previous plans were sized for a $15 budget. At gpt-4.1-mini pricing
-- ($0.40 / 1M prompt, $1.60 / 1M completion) and this workload's roughly
-- 85/15 prompt-to-completion split, a token costs about $0.58 per 1M.
--
-- Worst case, every seeded user exhausting its daily allowance on the same
-- day (1 project lead, 4 editors, 4 approvers, 5 viewers):
--
--   200k + 4x100k + 4x80k + 5x30k = 1,070,000 tokens  ~=  $0.62/day
--
-- That is about 12% of the $5 cap per day, so the budget survives roughly
-- eight consecutive worst-case days. Real usage is far below that because
-- only a few users are active at once.
--
-- These are the knobs to turn if a role runs out mid-demo: raise the row
-- here, no code change is needed.

insert into ai_credit_plans (role_key, daily_token_limit, daily_request_limit, description) values
    ('project_admin', 200000, 80, 'Project leads - full oversight across all teams'),
    ('editor',        100000, 50, 'Editors - authoring and readiness checks'),
    ('approver',       80000, 40, 'Team approvers - review and sign-off workloads'),
    ('viewer',         30000, 15, 'Viewers - read-only, occasional summaries'),
    ('default',        30000, 15, 'Fallback when a role has no explicit plan')
on conflict (role_key) do update
    set daily_token_limit   = excluded.daily_token_limit,
        daily_request_limit = excluded.daily_request_limit,
        description         = excluded.description;

-- Cumulative spend, so the service can enforce the cap across restarts
-- instead of trusting a counter that lives in process memory.
create or replace function ai_total_spend_usd()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(sum(cost_usd), 0)::numeric from ai_usage_events;
$$;

revoke execute on function ai_total_spend_usd() from anon, public;
grant execute on function ai_total_spend_usd() to authenticated;
