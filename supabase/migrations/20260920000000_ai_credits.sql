-- Chroma Sync - server-enforced AI token credits
--
-- Replaces the localStorage "quota" in the frontend, which was advisory only:
-- clearing site data reset it, and it was never consulted by the backend.
--
-- Model (mirrors how commercial AI APIs meter usage):
--   * Credits are TOKENS, not request counts, because a 200-decision report
--     costs far more than a one-line chat turn.
--   * Each request RESERVES an estimate up front, then SETTLES with the real
--     token count once the provider reports it. Reserving first is what makes
--     concurrent requests safe - two parallel calls cannot both pass a check
--     against the same stale balance.
--   * Allowances are per user per UTC day, driven by role.
--
-- Terminology note: `ai_summary_quotas` (migration 20260912000005) is a
-- different, narrower thing - 2 views per team per decision. It is unchanged.

set search_path = public;

-- ---------------------------------------------------------------------------
-- Allowances by role
-- ---------------------------------------------------------------------------

create table if not exists ai_credit_plans (
    role_key           text primary key,
    daily_token_limit  bigint not null check (daily_token_limit >= 0),
    daily_request_limit int  not null check (daily_request_limit >= 0),
    description        text
);

insert into ai_credit_plans (role_key, daily_token_limit, daily_request_limit, description) values
    ('project_admin', 400000, 400, 'Project leads - full oversight across all teams'),
    ('approver',      150000, 150, 'Team approvers - review and sign-off workloads'),
    ('editor',        120000, 120, 'Editors - authoring and readiness checks'),
    ('viewer',         40000,  40, 'Viewers - read-only, occasional summaries'),
    ('default',        40000,  40, 'Fallback when a role has no explicit plan')
on conflict (role_key) do update
    set daily_token_limit   = excluded.daily_token_limit,
        daily_request_limit = excluded.daily_request_limit,
        description         = excluded.description;

alter table ai_credit_plans enable row level security;

drop policy if exists ai_credit_plans_read on ai_credit_plans;
create policy ai_credit_plans_read on ai_credit_plans
    for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Usage ledger
-- ---------------------------------------------------------------------------
-- One row per AI request. `reserved` rows hold an estimate and are replaced by
-- the real figures on settle. Rows are never deleted - this is the audit trail
-- for AI spend.

create table if not exists ai_usage_events (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid references auth.users (id) on delete set null,
    team              team_t,
    feature           text not null,
    model             text,
    status            text not null default 'reserved'
                      check (status in ('reserved', 'completed', 'failed', 'expired')),
    estimated_tokens  int  not null default 0 check (estimated_tokens >= 0),
    prompt_tokens     int  not null default 0 check (prompt_tokens >= 0),
    completion_tokens int  not null default 0 check (completion_tokens >= 0),
    total_tokens      int  not null default 0 check (total_tokens >= 0),
    cost_usd          numeric(12, 6) not null default 0,
    -- Tokens that actually count against the user's allowance: the estimate
    -- while in flight, the real total once settled, zero if it failed.
    billed_tokens     int generated always as (
                          case status
                              when 'reserved' then estimated_tokens
                              when 'completed' then total_tokens
                              else 0
                          end
                      ) stored,
    usage_date        date not null default (now() at time zone 'utc')::date,
    created_at        timestamptz not null default now(),
    settled_at        timestamptz
);

create index if not exists ai_usage_events_user_date_idx
    on ai_usage_events (user_id, usage_date);
create index if not exists ai_usage_events_open_idx
    on ai_usage_events (created_at) where status = 'reserved';

alter table ai_usage_events enable row level security;

-- Users see their own spend; project leads see everything (cost oversight).
drop policy if exists ai_usage_events_select_own on ai_usage_events;
create policy ai_usage_events_select_own on ai_usage_events
    for select to authenticated
    using (user_id = auth.uid() or coalesce(is_project_lead(), false));

-- No INSERT/UPDATE/DELETE policies: the ledger is writable only through the
-- SECURITY DEFINER functions below, so a client cannot credit itself.

-- ---------------------------------------------------------------------------
-- Balance
-- ---------------------------------------------------------------------------

create or replace function ai_plan_for(p_user uuid)
returns ai_credit_plans
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_role text;
    v_plan ai_credit_plans;
begin
    select case
               when p.is_project_lead then 'project_admin'
               else coalesce(p.role::text, 'default')
           end
      into v_role
      from profiles p
     where p.id = p_user;

    select * into v_plan from ai_credit_plans where role_key = coalesce(v_role, 'default');
    if not found then
        select * into v_plan from ai_credit_plans where role_key = 'default';
    end if;
    return v_plan;
end;
$$;

create or replace function ai_credit_balance(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_plan     ai_credit_plans;
    v_tokens   bigint;
    v_requests int;
    v_today    date := (now() at time zone 'utc')::date;
begin
    v_plan := ai_plan_for(p_user);

    select coalesce(sum(billed_tokens), 0),
           count(*) filter (where status in ('reserved', 'completed'))
      into v_tokens, v_requests
      from ai_usage_events
     where user_id = p_user and usage_date = v_today;

    return jsonb_build_object(
        'token_limit',      v_plan.daily_token_limit,
        'tokens_used',      v_tokens,
        'tokens_remaining', greatest(v_plan.daily_token_limit - v_tokens, 0),
        'request_limit',    v_plan.daily_request_limit,
        'requests_used',    v_requests,
        'requests_remaining', greatest(v_plan.daily_request_limit - v_requests, 0),
        'plan',             v_plan.role_key,
        -- Allowances roll over at 00:00 UTC, matching usage_date.
        'resets_at',        ((v_today + 1)::timestamp at time zone 'utc'),
        'exhausted',        (v_tokens >= v_plan.daily_token_limit
                             or v_requests >= v_plan.daily_request_limit)
    );
end;
$$;

-- What the frontend calls to paint the credit meter.
create or replace function ai_my_credits()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'not authenticated' using errcode = '42501';
    end if;
    return ai_credit_balance(auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- Reserve / settle
-- ---------------------------------------------------------------------------

create or replace function ai_reserve_credits(
    p_user             uuid,
    p_feature          text,
    p_estimated_tokens int,
    p_team             team_t default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_plan    ai_credit_plans;
    v_balance jsonb;
    v_id      uuid;
    v_est     int := greatest(coalesce(p_estimated_tokens, 0), 1);
begin
    if p_user is null then
        raise exception 'ai_reserve_credits requires a user' using errcode = '22004';
    end if;

    v_plan := ai_plan_for(p_user);

    -- Serialise concurrent reservations for this user so two requests cannot
    -- both read the same balance and both be admitted.
    perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

    v_balance := ai_credit_balance(p_user);

    if (v_balance ->> 'requests_remaining')::int <= 0 then
        raise exception 'AI daily request limit reached'
            using errcode = 'PT429', detail = v_balance::text;
    end if;

    if (v_balance ->> 'tokens_remaining')::bigint < v_est then
        raise exception 'AI daily token allowance exhausted'
            using errcode = 'PT429', detail = v_balance::text;
    end if;

    insert into ai_usage_events (user_id, team, feature, estimated_tokens, status)
    values (p_user, p_team, coalesce(p_feature, 'unknown'), v_est, 'reserved')
    returning id into v_id;

    return jsonb_build_object('request_id', v_id, 'balance', ai_credit_balance(p_user));
end;
$$;

create or replace function ai_settle_credits(
    p_request_id       uuid,
    p_prompt_tokens    int,
    p_completion_tokens int,
    p_cost_usd         numeric,
    p_model            text,
    p_status           text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user uuid;
begin
    if p_status not in ('completed', 'failed') then
        raise exception 'invalid settle status %', p_status using errcode = '22023';
    end if;

    update ai_usage_events
       set prompt_tokens     = greatest(coalesce(p_prompt_tokens, 0), 0),
           completion_tokens = greatest(coalesce(p_completion_tokens, 0), 0),
           total_tokens      = greatest(coalesce(p_prompt_tokens, 0), 0)
                               + greatest(coalesce(p_completion_tokens, 0), 0),
           cost_usd          = greatest(coalesce(p_cost_usd, 0), 0),
           model             = p_model,
           status            = p_status,
           settled_at        = now()
     where id = p_request_id
       and status = 'reserved'   -- idempotent: a replayed settle is a no-op
    returning user_id into v_user;

    if v_user is null then
        return jsonb_build_object('settled', false);
    end if;
    return jsonb_build_object('settled', true, 'balance', ai_credit_balance(v_user));
end;
$$;

-- A crashed worker leaves a reservation holding tokens forever. Expiring them
-- releases the allowance; 'expired' bills zero via the generated column.
create or replace function ai_expire_stale_reservations(p_older_than interval default '15 minutes')
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count int;
begin
    update ai_usage_events
       set status = 'expired', settled_at = now()
     where status = 'reserved'
       and created_at < now() - p_older_than;
    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Browsers may only read their own balance. Reserve/settle mutate the ledger
-- and are reachable only by the AI service, which holds the service role.

revoke execute on function ai_reserve_credits(uuid, text, int, team_t) from anon, authenticated, public;
revoke execute on function ai_settle_credits(uuid, int, int, numeric, text, text) from anon, authenticated, public;
revoke execute on function ai_expire_stale_reservations(interval) from anon, authenticated, public;
revoke execute on function ai_credit_balance(uuid) from anon, public;

grant execute on function ai_my_credits() to authenticated;
revoke execute on function ai_my_credits() from anon, public;

do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        perform cron.schedule(
            'ai-expire-stale-reservations',
            '*/10 * * * *',
            $cron$select public.ai_expire_stale_reservations()$cron$
        );
    end if;
exception when others then
    raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end$$;
