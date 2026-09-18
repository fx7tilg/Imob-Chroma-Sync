-- Chroma Sync - Phase 1
-- Migration 0001: schema (enums, tables, indexes)
--
-- Design principle: one record per component per business area. Every write is
-- audit-logged (see migration 0003). Access control lives at the DB (migration 0002).

set search_path = public, extensions;

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type team_t as enum (
    'design',
    'engineering',
    'procurement',
    'quality'
);

create type decision_status_t as enum (
    'draft',
    'submitted',
    'under_review',
    'approved',
    'rejected'
);

create type approval_status_t as enum (
    'pending',
    'approved',
    'rejected'
);

create type ai_rating_t as enum (
    'green',
    'yellow',
    'red'
);

create type audit_action_t as enum (
    'INSERT',
    'UPDATE',
    'DELETE'
);

-- ---------------------------------------------------------------------------
-- profiles
-- One row per auth user. Team drives every RLS decision.
-- ---------------------------------------------------------------------------

create table profiles (
    id              uuid primary key references auth.users(id) on delete cascade,
    full_name       text not null,
    team            team_t,                       -- null = project_lead / admin
    is_project_lead boolean not null default false,
    created_at      timestamptz not null default now()
);

comment on table profiles is 'Application-level user profile. Team drives RLS.';

-- Helper: current user's team (used by RLS policies).
create or replace function current_team()
returns team_t
language sql
stable
security definer
set search_path = public
as $$
    select team from public.profiles where id = auth.uid();
$$;

create or replace function is_project_lead()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(is_project_lead, false) from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- materials (DiMa mock lookup)
-- ---------------------------------------------------------------------------

create table materials (
    code                text primary key,
    display_name        text not null,
    gloss               integer,
    substrate           text,
    temperature_min_c   integer,
    temperature_max_c   integer,
    compatibility_notes text,
    vred_render_url     text,
    created_at          timestamptz not null default now()
);

comment on table materials is 'DiMa mock: material properties looked up by material code.';

-- ---------------------------------------------------------------------------
-- decisions (core table)
-- ---------------------------------------------------------------------------

create table decisions (
    id                       uuid primary key default gen_random_uuid(),
    component_name           text not null,
    business_area            text not null,

    -- Design-owned fields
    colour_code              text,
    material_reference       text references materials(code),
    design_notes             text,

    -- Engineering-owned fields
    feasibility_status       text,
    technical_constraints    text,

    -- Procurement-owned fields
    supplier                 text,
    lead_time_days           integer,
    price_per_unit_cents     integer,

    -- Quality-owned fields (final decision reason lives in approvals)

    -- Workflow
    status                   decision_status_t not null default 'draft',
    owner_team               team_t not null,

    -- AI-owned fields (never edited by humans directly)
    ai_rating                ai_rating_t,
    ai_reason                text,
    ai_flags                 jsonb not null default '[]'::jsonb,
    ai_last_checked_at       timestamptz,

    -- External mock refs
    dima_material_reference  text,
    vred_render_url          text,

    -- Metadata
    created_by               uuid not null references auth.users(id),
    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now()
);

create index decisions_business_area_idx on decisions(business_area);
create index decisions_status_idx        on decisions(status);
create index decisions_owner_team_idx    on decisions(owner_team);
create index decisions_material_ref_idx  on decisions(material_reference);

-- ---------------------------------------------------------------------------
-- approvals
-- One row per (decision, team). Fully approved = 4 approved rows.
-- ---------------------------------------------------------------------------

create table approvals (
    id           uuid primary key default gen_random_uuid(),
    decision_id  uuid not null references decisions(id) on delete cascade,
    team         team_t not null,
    status       approval_status_t not null default 'pending',
    approved_by  uuid references auth.users(id),
    notes        text,
    decided_at   timestamptz,
    created_at   timestamptz not null default now(),
    unique (decision_id, team)
);

create index approvals_decision_idx on approvals(decision_id);

-- ---------------------------------------------------------------------------
-- audit_log
-- Written by triggers on decisions and approvals (migration 0003).
-- ---------------------------------------------------------------------------

create table audit_log (
    id          bigserial primary key,
    table_name  text not null,
    row_id      uuid not null,
    action      audit_action_t not null,
    changed_by  uuid,
    changed_at  timestamptz not null default now(),
    old_values  jsonb,
    new_values  jsonb
);

create index audit_log_row_idx        on audit_log(table_name, row_id);
create index audit_log_changed_at_idx on audit_log(changed_at desc);

-- ---------------------------------------------------------------------------
-- conflicts (populated by AI service in Phase 4)
-- ---------------------------------------------------------------------------

create table conflicts (
    id             uuid primary key default gen_random_uuid(),
    decision_a_id  uuid not null references decisions(id) on delete cascade,
    decision_b_id  uuid not null references decisions(id) on delete cascade,
    conflict_type  text not null,
    explanation    text not null,
    detected_at    timestamptz not null default now(),
    resolved       boolean not null default false,
    resolved_by    uuid references auth.users(id),
    resolved_at    timestamptz,
    check (decision_a_id <> decision_b_id)
);

create index conflicts_decision_a_idx on conflicts(decision_a_id) where resolved = false;
create index conflicts_decision_b_idx on conflicts(decision_b_id) where resolved = false;

-- ---------------------------------------------------------------------------
-- updated_at trigger for decisions
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger decisions_set_updated_at
    before update on decisions
    for each row
    execute function set_updated_at();
