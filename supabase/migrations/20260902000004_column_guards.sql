-- Chroma Sync - Phase 1
-- Migration 0004: column-level write guard on decisions
--
-- RLS in migration 0002 lets any team update a decision row. This trigger
-- enforces the per-team column ownership rules and status transitions.
--
-- Column ownership:
--   design       -> colour_code, material_reference, design_notes, dima_material_reference
--   engineering  -> feasibility_status, technical_constraints
--   procurement  -> supplier, lead_time_days, price_per_unit_cents
--   quality      -> (no data fields; only status transitions via approvals flow)
--
-- Status transitions:
--   draft        -> submitted        (design only)
--   submitted    -> under_review     (any non-quality team, once they add data)
--   under_review -> approved         (quality only, and only when all 4 teams approved)
--   under_review -> rejected         (quality only)
--   any          -> any              (project_lead override, audit-logged)
--
-- AI-owned columns (ai_rating, ai_reason, ai_flags, ai_last_checked_at) can
-- only be written by service_role (AI service) - enforced by rejecting any
-- change from a non-null auth.uid() session.

set search_path = public;

create or replace function decisions_column_guard()
returns trigger
language plpgsql
as $$
declare
    v_team          team_t := current_team();
    v_is_lead       boolean := coalesce(is_project_lead(), false);
    v_is_service    boolean := auth.uid() is null;   -- service_role has no auth.uid()
    v_ai_changed    boolean;
    v_design_changed boolean;
    v_eng_changed   boolean;
    v_proc_changed  boolean;
begin
    -- Service role and project leads bypass column rules.
    if v_is_service or v_is_lead then
        return new;
    end if;

    if v_team is null then
        raise exception 'user has no team assigned' using errcode = '42501';
    end if;

    v_ai_changed :=
        new.ai_rating          is distinct from old.ai_rating          or
        new.ai_reason          is distinct from old.ai_reason          or
        new.ai_flags           is distinct from old.ai_flags           or
        new.ai_last_checked_at is distinct from old.ai_last_checked_at;

    if v_ai_changed then
        raise exception 'AI-owned columns can only be written by the AI service'
            using errcode = '42501';
    end if;

    v_design_changed :=
        new.colour_code             is distinct from old.colour_code             or
        new.material_reference      is distinct from old.material_reference      or
        new.design_notes            is distinct from old.design_notes            or
        new.dima_material_reference is distinct from old.dima_material_reference or
        new.vred_render_url         is distinct from old.vred_render_url;

    v_eng_changed :=
        new.feasibility_status    is distinct from old.feasibility_status or
        new.technical_constraints is distinct from old.technical_constraints;

    v_proc_changed :=
        new.supplier             is distinct from old.supplier             or
        new.lead_time_days       is distinct from old.lead_time_days       or
        new.price_per_unit_cents is distinct from old.price_per_unit_cents;

    if v_design_changed and v_team <> 'design' then
        raise exception 'only design team can edit design-owned fields'
            using errcode = '42501';
    end if;

    if v_eng_changed and v_team <> 'engineering' then
        raise exception 'only engineering team can edit engineering-owned fields'
            using errcode = '42501';
    end if;

    if v_proc_changed and v_team <> 'procurement' then
        raise exception 'only procurement team can edit procurement-owned fields'
            using errcode = '42501';
    end if;

    -- Status transitions
    if new.status is distinct from old.status then
        if old.status = 'draft' and new.status = 'submitted' then
            if v_team <> 'design' then
                raise exception 'only design can submit a draft' using errcode = '42501';
            end if;
        elsif old.status = 'submitted' and new.status = 'under_review' then
            if v_team = 'quality' then
                raise exception 'quality cannot move submitted -> under_review'
                    using errcode = '42501';
            end if;
        elsif old.status = 'under_review' and new.status in ('approved','rejected') then
            if v_team <> 'quality' then
                raise exception 'only quality can approve or reject' using errcode = '42501';
            end if;
        else
            raise exception 'invalid status transition: % -> %', old.status, new.status
                using errcode = '42501';
        end if;
    end if;

    -- Immutable fields
    if new.created_by is distinct from old.created_by then
        raise exception 'created_by is immutable' using errcode = '42501';
    end if;
    if new.created_at is distinct from old.created_at then
        raise exception 'created_at is immutable' using errcode = '42501';
    end if;
    if new.owner_team is distinct from old.owner_team then
        raise exception 'owner_team is immutable' using errcode = '42501';
    end if;

    return new;
end;
$$;

create trigger decisions_column_guard_trg
    before update on decisions
    for each row
    execute function decisions_column_guard();

-- ---------------------------------------------------------------------------
-- Approvals: guard against approving without notes on rejection, and stamp
-- decided_at automatically.
-- ---------------------------------------------------------------------------

create or replace function approvals_guard()
returns trigger
language plpgsql
as $$
begin
    if new.status = 'rejected' and (new.notes is null or length(trim(new.notes)) = 0) then
        raise exception 'rejection requires a note' using errcode = '22023';
    end if;

    if new.status in ('approved','rejected')
       and (tg_op = 'INSERT' or new.status is distinct from old.status)
    then
        new.approved_by := coalesce(new.approved_by, auth.uid());
        new.decided_at  := coalesce(new.decided_at, now());
    end if;

    return new;
end;
$$;

create trigger approvals_guard_trg
    before insert or update on approvals
    for each row
    execute function approvals_guard();
