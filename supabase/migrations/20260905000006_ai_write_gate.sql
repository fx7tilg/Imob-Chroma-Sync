-- Chroma Sync - Phase 5
-- Migration 0006: narrow RPC gate for AI-written columns.
--
-- The column guard (migration 0004) intentionally blocks any authenticated
-- user from writing ai_rating/ai_reason/ai_flags/ai_last_checked_at directly
-- - those are meant to be written only by a trusted process (originally the
-- Supabase Edge Function calling the AI service with service_role).
--
-- Since Edge Functions aren't deployed in this environment, the frontend
-- calls the FastAPI /readiness endpoint directly and needs a safe, narrow
-- way to persist the result. This RPC is that gate: it only ever touches
-- the four AI-owned columns on a single row, nothing else, regardless of
-- which team is calling it.

set search_path = public;

create or replace function decisions_column_guard()
returns trigger
language plpgsql
as $$
declare
    v_team          team_t := current_team();
    v_is_lead       boolean := coalesce(is_project_lead(), false);
    v_is_service    boolean := auth.uid() is null;   -- service_role has no auth.uid()
    v_ai_bypass     boolean := coalesce(current_setting('app.ai_write', true), '') = 'on';
    v_ai_changed    boolean;
    v_design_changed boolean;
    v_eng_changed   boolean;
    v_proc_changed  boolean;
begin
    -- Service role, project leads, and the set_ai_readiness() RPC bypass column rules.
    if v_is_service or v_is_lead or v_ai_bypass then
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
        elsif old.status = 'rejected' and new.status = 'draft' then
            if v_team <> 'design' then
                raise exception 'only design can reopen a rejected decision' using errcode = '42501';
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

-- ---------------------------------------------------------------------------
-- set_ai_readiness - the only sanctioned way for an authenticated session to
-- write AI results. Touches exactly 4 columns on exactly 1 row.
-- ---------------------------------------------------------------------------

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
begin
    perform set_config('app.ai_write', 'on', true); -- transaction-scoped (true = local)

    update decisions
    set ai_rating          = p_rating,
        ai_reason           = p_reason,
        ai_flags            = p_flags,
        ai_last_checked_at  = now()
    where id = p_decision_id;
end;
$$;

grant execute on function set_ai_readiness(uuid, ai_rating_t, text, jsonb) to authenticated;
