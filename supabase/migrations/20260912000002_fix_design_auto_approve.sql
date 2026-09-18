-- =========================================================================
-- Chroma Sync - Fix Design Auto-Approve (Enterprise RBAC)
-- Migration: Remove the implicit auto-approval for the Design team.
-- =========================================================================

set search_path = public, extensions;

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

        -- DO NOT auto-create the design approval as 'approved'.
        -- It will be created as 'pending' by the ensure_all_team_approvals() trigger.
    end if;

    return NEW;
end;
$$;
