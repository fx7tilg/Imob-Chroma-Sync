-- =========================================================================
-- Chroma Sync - Rejection Cascade & Approval Reset
-- Migration: Reset all approvals when a rejected decision is re-submitted
--
-- Real-world PPAP: when Design revises and re-submits, ALL previous
-- team approvals are invalidated. The cycle restarts from Engineering.
-- Design's approval is auto-granted on submission (PPAP implicit).
-- =========================================================================

set search_path = public, extensions;

-- =========================================================================
-- 1. FUNCTION: Reset all approvals to pending on re-submission
-- =========================================================================

create or replace function reset_approvals_on_resubmit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Only fire when status transitions TO 'submitted'
    -- (covers both draft->submitted and the re-submit after rejection)
    if NEW.status = 'submitted' and OLD.status in ('draft', 'rejected') then
        -- Reset all existing approval rows for this decision to pending
        update approvals
        set status     = 'pending',
            approved_by = null,
            notes       = null,
            decided_at  = null
        where decision_id = NEW.id;

        -- Auto-create the design approval as 'approved' (PPAP: implicit on submit)
        insert into approvals (decision_id, team, status, approved_by, decided_at)
        values (NEW.id, 'design', 'approved', NEW.submitted_by, now())
        on conflict (decision_id, team)
        do update set
            status      = 'approved',
            approved_by = NEW.submitted_by,
            decided_at  = now(),
            notes       = 'Auto-approved: Design submitter implicit approval (PPAP)';
    end if;

    return NEW;
end;
$$;

-- Trigger fires AFTER the status update so the decision row is committed
drop trigger if exists trg_reset_approvals_on_resubmit on decisions;
create trigger trg_reset_approvals_on_resubmit
    after update on decisions
    for each row
    when (NEW.status = 'submitted' and OLD.status is distinct from NEW.status)
    execute function reset_approvals_on_resubmit();

-- Also fire on initial submission (INSERT where status is already 'submitted' - rare but possible)
-- The main path is draft->submitted via UPDATE, so the above trigger covers it.


-- =========================================================================
-- 2. Ensure approval rows exist for all 4 teams on first submission
-- =========================================================================

create or replace function ensure_all_team_approvals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    t text;
begin
    if NEW.status = 'submitted' then
        foreach t in array array['design','engineering','procurement','quality'] loop
            insert into approvals (decision_id, team, status)
            values (NEW.id, t::team_t, 'pending')
            on conflict (decision_id, team) do nothing;
        end loop;
    end if;
    return NEW;
end;
$$;

drop trigger if exists trg_ensure_approvals on decisions;
create trigger trg_ensure_approvals
    after update on decisions
    for each row
    when (NEW.status = 'submitted' and OLD.status is distinct from NEW.status)
    execute function ensure_all_team_approvals();


-- =========================================================================
-- Done!
-- =========================================================================
