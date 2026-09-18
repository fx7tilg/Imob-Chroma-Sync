-- Chroma Sync - Phase 1 MDM
-- Migration 0008: Master Data Management
--
-- Adds master tables for feasibility statuses and technical constraints.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- master_feasibility_statuses
-- ---------------------------------------------------------------------------

create table master_feasibility_statuses (
    code        text primary key,
    label       text not null,
    is_active   boolean not null default true,
    created_at  timestamptz not null default now()
);

comment on table master_feasibility_statuses is 'MDM: Allowed values for Engineering Feasibility Status.';

alter table master_feasibility_statuses enable row level security;

-- Read: all authenticated users
create policy "master_feasibility_statuses_select" on master_feasibility_statuses
    for select to authenticated using (true);

-- Write: only project leads
create policy "master_feasibility_statuses_all" on master_feasibility_statuses
    for all to authenticated using (is_project_lead());

-- ---------------------------------------------------------------------------
-- master_technical_constraints
-- ---------------------------------------------------------------------------

create table master_technical_constraints (
    code        text primary key,
    label       text not null,
    is_active   boolean not null default true,
    created_at  timestamptz not null default now()
);

comment on table master_technical_constraints is 'MDM: Allowed values for Engineering Technical Constraints.';

alter table master_technical_constraints enable row level security;

-- Read: all authenticated users
create policy "master_technical_constraints_select" on master_technical_constraints
    for select to authenticated using (true);

-- Write: only project leads
create policy "master_technical_constraints_all" on master_technical_constraints
    for all to authenticated using (is_project_lead());

-- ---------------------------------------------------------------------------
-- Seed Data
-- ---------------------------------------------------------------------------

insert into master_feasibility_statuses (code, label) values
    ('PENDING_REVIEW', 'Pending Review'),
    ('FEASIBLE_STD', 'Feasible - Standard Production'),
    ('FEASIBLE_CUSTOM', 'Feasible - Requires Custom Tooling'),
    ('FEASIBLE_CONDITIONAL', 'Feasible - See Constraints'),
    ('NOT_FEASIBLE_MATERIAL', 'Not Feasible - Material Limitation'),
    ('NOT_FEASIBLE_COST', 'Not Feasible - Cost Prohibitive');

insert into master_technical_constraints (code, label) values
    ('NO_CONSTRAINT', 'None - Standard part'),
    ('ERR_TEMP_HIGH', 'ERR-TEMP-001: Material degrades at operating temperature'),
    ('ERR_TEMP_LOW', 'ERR-TEMP-002: Material becomes brittle at low temperature'),
    ('ERR_MOLD_THICK', 'ERR-MOLD-042: Wall thickness exceeds maximum limits'),
    ('ERR_TOLERANCE', 'ERR-TOL-010: Dimensional tolerance cannot be guaranteed'),
    ('WARN_TOOLING', 'WARN-TOOL-100: Requires long lead-time custom tooling'),
    ('WARN_SUPPLY', 'WARN-SUP-200: Material constrained in global supply chain');
