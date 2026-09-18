-- Chroma Sync - Phase 1
-- Migration 0002: Row Level Security
--
-- Rules:
--   - All authenticated users can read every row (full transparency across teams).
--   - Writes are gated by team ownership.
--   - Column-level write enforcement for decisions lives in migration 0004
--     (BEFORE UPDATE trigger; RLS alone cannot restrict per-column).

set search_path = public;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;

create policy profiles_select_all
    on profiles for select
    to authenticated
    using (true);

create policy profiles_update_self
    on profiles for update
    to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());

-- Inserts happen via seed script or a SECURITY DEFINER signup handler,
-- both of which bypass RLS. No public insert policy on purpose.

-- ---------------------------------------------------------------------------
-- materials (read-only for app users)
-- ---------------------------------------------------------------------------

alter table materials enable row level security;

create policy materials_select_all
    on materials for select
    to authenticated
    using (true);

-- No insert/update/delete policies. Only service_role (seed + edge functions) can write.

-- ---------------------------------------------------------------------------
-- decisions
-- ---------------------------------------------------------------------------

alter table decisions enable row level security;

create policy decisions_select_all
    on decisions for select
    to authenticated
    using (true);

-- Only design can create decisions. Owner must be design, status must start as draft.
create policy decisions_insert_design
    on decisions for insert
    to authenticated
    with check (
        current_team() = 'design'
        and owner_team = 'design'
        and status    = 'draft'
        and created_by = auth.uid()
    );

-- Any team member can update a decision - column-level guard (migration 0004)
-- ensures they only touch fields they own. Quality can move status to
-- approved/rejected; other teams can move draft -> submitted -> under_review.
create policy decisions_update_team
    on decisions for update
    to authenticated
    using (current_team() is not null)
    with check (current_team() is not null);

-- No delete policy: decisions are immutable once created. Rejection is a status.

-- ---------------------------------------------------------------------------
-- approvals
-- ---------------------------------------------------------------------------

alter table approvals enable row level security;

create policy approvals_select_all
    on approvals for select
    to authenticated
    using (true);

-- A user can only insert an approval row for their own team.
create policy approvals_insert_own_team
    on approvals for insert
    to authenticated
    with check (
        team = current_team()
        and (approved_by is null or approved_by = auth.uid())
    );

-- A user can only update their own team's approval row.
create policy approvals_update_own_team
    on approvals for update
    to authenticated
    using (team = current_team())
    with check (team = current_team());

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------

alter table audit_log enable row level security;

create policy audit_log_select_all
    on audit_log for select
    to authenticated
    using (true);

-- No insert/update/delete policies. Writes happen via SECURITY DEFINER
-- triggers only (migration 0003), which bypass RLS.

-- ---------------------------------------------------------------------------
-- conflicts
-- ---------------------------------------------------------------------------

alter table conflicts enable row level security;

create policy conflicts_select_all
    on conflicts for select
    to authenticated
    using (true);

-- Any authenticated user can mark a conflict resolved.
create policy conflicts_update_resolve
    on conflicts for update
    to authenticated
    using (true)
    with check (resolved_by = auth.uid() or resolved_by is null);

-- Inserts come from the AI service (service_role), which bypasses RLS.
