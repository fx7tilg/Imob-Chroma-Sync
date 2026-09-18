-- =========================================================================
-- ai_summary_quotas table & logic
-- =========================================================================

-- Create the quotas table
create table if not exists ai_summary_quotas (
    decision_id uuid references decisions(id) on delete cascade,
    team team_t,
    views_used int default 0,
    primary key (decision_id, team)
);

-- Enable RLS
alter table ai_summary_quotas enable row level security;

-- Policies for quotas
create policy "allow select on ai_summary_quotas"
    on ai_summary_quotas for select
    to authenticated
    using (true);

-- We don't want users updating this directly; they must use the RPC.
-- So no UPDATE/INSERT policies for public.

-- RPC to securely increment the quota
create or replace function increment_ai_quota(p_decision_id uuid, p_team team_t)
returns int
language plpgsql
security definer -- runs as superuser to bypass RLS for the insert/update
as $$
declare
    v_views int;
begin
    -- Ensure the row exists and get current views
    insert into ai_summary_quotas (decision_id, team, views_used)
    values (p_decision_id, p_team, 0)
    on conflict (decision_id, team) do nothing;

    -- Lock the row and get current count
    select views_used into v_views
    from ai_summary_quotas
    where decision_id = p_decision_id and team = p_team
    for update;

    -- Enterprise Limit: 2 views per team per decision
    if v_views >= 2 then
        raise exception 'Quota exceeded: Team "%" has already viewed the AI summary 2 times.', p_team;
    end if;

    -- Increment
    update ai_summary_quotas
    set views_used = views_used + 1
    where decision_id = p_decision_id and team = p_team
    returning views_used into v_views;

    return v_views;
end;
$$;
