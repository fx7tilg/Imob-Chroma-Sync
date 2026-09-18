-- =========================================================================
-- Chroma Sync - Conflict Resolution Ownership
-- Migration: Add assignment, resolution type and notes to conflicts
--
-- Real-world PLM: conflicts are assigned to a responsible team,
-- require documented resolution, and block final Quality approval
-- until resolved.
-- =========================================================================

set search_path = public, extensions;

-- =========================================================================
-- 1. ADD RESOLUTION FIELDS TO CONFLICTS
-- =========================================================================

alter table conflicts add column if not exists assigned_team team_t;
alter table conflicts add column if not exists resolution_notes text;
alter table conflicts add column if not exists resolution_type text;

comment on column conflicts.assigned_team is 'Team responsible for resolving this conflict.';
comment on column conflicts.resolution_notes is 'Free-text description of what was done to resolve the conflict.';
comment on column conflicts.resolution_type is 'Category of resolution: colour_changed, deviation_accepted, spec_updated, duplicate_removed, other.';

-- Add constraint for resolution_type values
alter table conflicts drop constraint if exists chk_resolution_type;
alter table conflicts add constraint chk_resolution_type
    check (resolution_type is null or resolution_type in (
        'colour_changed',
        'deviation_accepted',
        'spec_updated',
        'duplicate_removed',
        'other'
    ));

-- Require resolution notes when marking as resolved
create or replace function conflict_resolution_guard()
returns trigger
language plpgsql
as $$
begin
    if NEW.resolved = true and OLD.resolved = false then
        if NEW.resolution_notes is null or length(trim(NEW.resolution_notes)) = 0 then
            raise exception 'Resolution notes are required when resolving a conflict'
                using errcode = '22023';
        end if;
        if NEW.resolution_type is null then
            raise exception 'Resolution type is required when resolving a conflict'
                using errcode = '22023';
        end if;
        -- Auto-stamp resolved_at and resolved_by
        NEW.resolved_at := coalesce(NEW.resolved_at, now());
        NEW.resolved_by := coalesce(NEW.resolved_by, auth.uid());
    end if;
    return NEW;
end;
$$;

drop trigger if exists trg_conflict_resolution_guard on conflicts;
create trigger trg_conflict_resolution_guard
    before update on conflicts
    for each row
    execute function conflict_resolution_guard();


-- =========================================================================
-- Done!
-- =========================================================================
