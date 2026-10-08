-- Chroma Sync - Production security hardening
--
-- Closes privilege-escalation and integrity holes found during the
-- production-readiness audit. Every statement is idempotent so the file is
-- safe to re-run against an existing database.
--
--   1. profiles: a user could set their own is_project_lead / role / team
--      (profiles_update_self had no column restriction) -> full admin takeover.
--   2. handle_new_user trusted is_project_lead from user-supplied signup
--      metadata -> self-service admin on signup.
--   3. profiles.pki_pin (demo card PINs) was readable by every authenticated
--      user, because profiles_select_all is `using (true)`.
--   4. audit_log_insert_all allowed forged audit entries (WITH CHECK (true)).
--   5. increment_ai_quota / snapshot_on_status_change were SECURITY DEFINER
--      without a pinned search_path.
--   6. set_ai_readiness let any authenticated caller rewrite the AI verdict of
--      an already-approved or already-rejected decision.

set search_path = public;

-- ---------------------------------------------------------------------------
-- 0. Demo PKI pins move out of the world-readable profiles table
-- ---------------------------------------------------------------------------
-- profiles.pki_pin is created by seed.sql only, but profiles_select_all is
-- `using (true)`, so in any seeded environment every authenticated user could
-- read every other user's card PIN. A column-level REVOKE cannot carve a hole
-- out of the table-level GRANT that Supabase issues to `authenticated`, so the
-- column is removed and the demo pins live in a table with RLS enabled and no
-- policies - unreachable from anon/authenticated, readable only by
-- service_role (which RLS does not apply to), i.e. the pki-auth function.

create table if not exists demo_pki_pins (
    profile_id uuid primary key references profiles (id) on delete cascade,
    pin        text not null unique
);

alter table demo_pki_pins enable row level security;
revoke all on demo_pki_pins from anon, authenticated;

-- Carry any seeded pins over before dropping the column.
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'pki_pin'
    ) then
        execute $m$
            insert into demo_pki_pins (profile_id, pin)
            select id, pki_pin from profiles where pki_pin is not null
            on conflict do nothing
        $m$;
        execute 'alter table public.profiles drop column pki_pin';
    end if;
end$$;

-- ---------------------------------------------------------------------------
-- 1. Privilege columns on profiles are no longer self-writable
-- ---------------------------------------------------------------------------
-- RLS cannot express per-column rules, so this mirrors the decisions
-- column-guard pattern. service_role (auth.uid() is null) and existing project
-- leads keep full control; everyone else may only edit presentational fields.

create or replace function profiles_privilege_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_is_service boolean := auth.uid() is null;
    v_is_lead    boolean := coalesce(is_project_lead(), false);
begin
    if v_is_service or v_is_lead then
        return new;
    end if;

    if new.is_project_lead is distinct from old.is_project_lead then
        raise exception 'Only a project lead may change is_project_lead'
            using errcode = '42501';
    end if;

    if new.role is distinct from old.role then
        raise exception 'Only a project lead may change role'
            using errcode = '42501';
    end if;

    if new.team is distinct from old.team then
        raise exception 'Only a project lead may change team'
            using errcode = '42501';
    end if;

    if new.id is distinct from old.id then
        raise exception 'profile id is immutable' using errcode = '42501';
    end if;

    return new;
end;
$$;

drop trigger if exists profiles_privilege_guard_trg on profiles;
create trigger profiles_privilege_guard_trg
    before update on profiles
    for each row
    execute function profiles_privilege_guard();

-- ---------------------------------------------------------------------------
-- 2. Signup may not grant privileges
-- ---------------------------------------------------------------------------
-- is_project_lead is now always false on signup. Leads are promoted by an
-- existing lead (Settings -> Team & Roles) or by service_role, which is the
-- only path that produces an audit trail.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_team text := new.raw_user_meta_data ->> 'team';
    v_team_t team_t;
begin
    -- Unknown team strings must not abort the signup transaction.
    begin
        v_team_t := nullif(v_team, '')::team_t;
    exception when others then
        v_team_t := null;
    end;

    insert into public.profiles (id, full_name, team, is_project_lead)
    values (
        new.id,
        coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email),
        v_team_t,
        false
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. audit_log entries can no longer be forged
-- ---------------------------------------------------------------------------
-- The trigger in migration 0003 is SECURITY DEFINER and bypasses RLS, so it is
-- unaffected. Manual client inserts must now be attributable to the caller and
-- cannot claim to be an admin override.

drop policy if exists "audit_log_insert_all" on audit_log;
create policy audit_log_insert_self
    on audit_log for insert
    to authenticated
    with check (
        changed_by = auth.uid()
        and coalesce(is_admin_override, false) = false
    );

-- ---------------------------------------------------------------------------
-- 5. Pin search_path on the remaining SECURITY DEFINER functions
-- ---------------------------------------------------------------------------

create or replace function increment_ai_quota(p_decision_id uuid, p_team team_t)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
    v_views int;
begin
    insert into ai_summary_quotas (decision_id, team, views_used)
    values (p_decision_id, p_team, 0)
    on conflict (decision_id, team) do nothing;

    select views_used into v_views
    from ai_summary_quotas
    where decision_id = p_decision_id and team = p_team
    for update;

    if v_views >= 2 then
        raise exception 'Quota exceeded: Team "%" has already viewed the AI summary 2 times.', p_team;
    end if;

    update ai_summary_quotas
    set views_used = views_used + 1
    where decision_id = p_decision_id and team = p_team
    returning views_used into v_views;

    return v_views;
end;
$$;

revoke execute on function increment_ai_quota(uuid, team_t) from anon, public;
grant execute on function increment_ai_quota(uuid, team_t) to authenticated;

create or replace function snapshot_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if old.status is distinct from new.status or old.version is distinct from new.version then
        insert into decision_snapshots (decision_id, version, status, snapshot, created_by)
        values (
            new.id,
            new.version,
            new.status,
            to_jsonb(new),
            coalesce(new.submitted_by, auth.uid())
        );
    end if;
    return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. set_ai_readiness may not rewrite terminal decisions
-- ---------------------------------------------------------------------------
-- The browser calls this RPC directly (lib/ai.ts), so it must stay granted to
-- `authenticated`. What it must NOT allow is a non-service caller flipping an
-- already approved/rejected decision - the 10-arg version auto-rejects on a
-- 'red' rating, which would otherwise be a one-call integrity attack.

create or replace function set_ai_readiness(
    p_decision_id uuid,
    p_rating ai_rating_t,
    p_reason text,
    p_flags jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_status decision_status_t;
begin
    select status into v_status from decisions where id = p_decision_id;
    if v_status is null then
        raise exception 'decision not found' using errcode = 'P0002';
    end if;

    if auth.uid() is not null and v_status in ('approved', 'rejected') then
        raise exception 'AI readiness cannot be rewritten on a % decision', v_status
            using errcode = '42501';
    end if;

    perform set_config('app.ai_write', 'on', true);

    update decisions
    set ai_rating          = p_rating,
        ai_reason          = p_reason,
        ai_flags           = coalesce(p_flags, '[]'::jsonb),
        ai_last_checked_at = now()
    where id = p_decision_id;
end;
$$;

create or replace function set_ai_readiness(
    p_decision_id uuid,
    p_rating ai_rating_t,
    p_reason text,
    p_flags jsonb,
    p_rc1_lifecycle ai_rating_t,
    p_rc2_compliance ai_rating_t,
    p_rc3_lead_time ai_rating_t,
    p_rc4_visual ai_rating_t,
    p_rc5_approval_rbac ai_rating_t,
    p_rc6_conflict ai_rating_t,
    p_rc_flags jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_status decision_status_t;
begin
    select status into v_status from decisions where id = p_decision_id;
    if v_status is null then
        raise exception 'decision not found' using errcode = 'P0002';
    end if;

    if auth.uid() is not null and v_status in ('approved', 'rejected') then
        raise exception 'AI readiness cannot be rewritten on a % decision', v_status
            using errcode = '42501';
    end if;

    perform set_config('app.ai_write', 'on', true);

    update decisions
       set ai_rating          = p_rating,
           ai_reason          = p_reason,
           ai_flags           = coalesce(p_flags, '[]'::jsonb),
           ai_last_checked_at = now(),
           rc1_lifecycle      = p_rc1_lifecycle,
           rc2_compliance     = p_rc2_compliance,
           rc3_lead_time      = p_rc3_lead_time,
           rc4_visual         = p_rc4_visual,
           rc5_approval_rbac  = p_rc5_approval_rbac,
           rc6_conflict       = p_rc6_conflict,
           rc_flags           = coalesce(p_rc_flags, '{}'::jsonb),
           status             = case
                                  when p_rating = 'red' and status in ('submitted', 'under_review')
                                  then 'rejected'::decision_status_t
                                  else status
                                end
     where id = p_decision_id;
end;
$$;

revoke execute on function set_ai_readiness(uuid, ai_rating_t, text, jsonb) from anon, public;
grant execute on function set_ai_readiness(uuid, ai_rating_t, text, jsonb) to authenticated;
revoke execute on function set_ai_readiness(
    uuid, ai_rating_t, text, jsonb, ai_rating_t, ai_rating_t,
    ai_rating_t, ai_rating_t, ai_rating_t, ai_rating_t, jsonb
) from anon, public;
grant execute on function set_ai_readiness(
    uuid, ai_rating_t, text, jsonb, ai_rating_t, ai_rating_t,
    ai_rating_t, ai_rating_t, ai_rating_t, ai_rating_t, jsonb
) to authenticated;
