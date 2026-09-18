-- =========================================================================
-- Chroma Sync - Phase 1a: Ratings domain (hackathon dataset alignment)
--
-- Adds the entities the organiser's dataset spec requires and that the
-- 6-criterion rating engine needs to score against DiMa / VRED / RBAC.
--
-- NEW:
--   * components                 - CMP-01..CMP-12 (id text PK)
--   * vred_visualizations        - VRD-001..VRD-019 (id text PK)
--   * rating_criteria (static)   - RC-1..RC-6 fixed spec
--   * profiles.role              - Editor | Approver | Viewer (orthogonal to team)
--   * materials extensions       - lifecycle, compliance, lead-time-weeks,
--                                  finish, RAL, hex, material_type, supplier_code
--   * decisions.component_id     - nullable FK to components (component_name kept)
--
-- Does NOT modify decisions_column_guard or set_ai_readiness - that is
-- handled by 20260911000004_rating_per_criterion.
-- =========================================================================

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
    if not exists (select 1 from pg_type where typname = 'material_lifecycle_t') then
        create type material_lifecycle_t as enum ('active', 'deprecated');
    end if;

    if not exists (select 1 from pg_type where typname = 'material_compliance_t') then
        create type material_compliance_t as enum ('pass', 'pending', 'fail');
    end if;

    if not exists (select 1 from pg_type where typname = 'material_finish_t') then
        create type material_finish_t as enum ('gloss', 'matte', 'satin', 'grained', 'brushed');
    end if;

    if not exists (select 1 from pg_type where typname = 'material_type_t') then
        create type material_type_t as enum (
            'leather', 'tpo_plastic', 'fabric', 'chrome', 'veneer',
            'alcantara', 'woven_fabric', 'wood_veneer'
        );
    end if;

    if not exists (select 1 from pg_type where typname = 'profile_role_t') then
        create type profile_role_t as enum ('editor', 'approver', 'viewer');
    end if;

    if not exists (select 1 from pg_type where typname = 'vred_render_status_t') then
        create type vred_render_status_t as enum ('rendered', 'pending');
    end if;

    if not exists (select 1 from pg_type where typname = 'vred_visual_match_t') then
        create type vred_visual_match_t as enum ('match', 'mismatch');
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- components - organiser CMP-01 … CMP-12
-- ---------------------------------------------------------------------------

create table if not exists components (
    id              text primary key,
    name            text not null,
    zone            text not null,
    vehicle_program text not null,
    created_at      timestamptz not null default now()
);

comment on table components is 'Vehicle components (organiser dataset: CMP-01..CMP-12).';

alter table components enable row level security;

drop policy if exists components_select_all on components;
create policy components_select_all on components
    for select to authenticated using (true);

drop policy if exists components_write_lead on components;
create policy components_write_lead on components
    for all to authenticated
    using (coalesce(is_project_lead(), false))
    with check (coalesce(is_project_lead(), false));

-- ---------------------------------------------------------------------------
-- materials - extend with lifecycle / compliance / lead-time / finish / etc.
-- ---------------------------------------------------------------------------

alter table materials add column if not exists lifecycle_status  material_lifecycle_t;
alter table materials add column if not exists compliance_status material_compliance_t;
alter table materials add column if not exists lead_time_weeks   integer;
alter table materials add column if not exists finish            material_finish_t;
alter table materials add column if not exists ral_code          text;
alter table materials add column if not exists hex_colour        text;
alter table materials add column if not exists material_type     material_type_t;
alter table materials add column if not exists supplier_code     text;

create index if not exists materials_lifecycle_idx  on materials(lifecycle_status);
create index if not exists materials_compliance_idx on materials(compliance_status);

-- ---------------------------------------------------------------------------
-- vred_visualizations - organiser VRD-001 … VRD-019
-- ---------------------------------------------------------------------------

create table if not exists vred_visualizations (
    id              text primary key,
    component_id    text not null references components(id) on delete cascade,
    material_code   text not null references materials(code) on delete cascade,
    scene_reference text,
    render_status   vred_render_status_t not null default 'pending',
    last_rendered   timestamptz,
    visual_match    vred_visual_match_t,
    created_at      timestamptz not null default now()
);

comment on table vred_visualizations is 'VRED render records for (component, material) pairs.';

create index if not exists vred_component_idx        on vred_visualizations(component_id);
create index if not exists vred_material_idx         on vred_visualizations(material_code);
create index if not exists vred_component_material_idx
    on vred_visualizations(component_id, material_code);

alter table vred_visualizations enable row level security;

drop policy if exists vred_select_all on vred_visualizations;
create policy vred_select_all on vred_visualizations
    for select to authenticated using (true);

drop policy if exists vred_write_lead on vred_visualizations;
create policy vred_write_lead on vred_visualizations
    for all to authenticated
    using (coalesce(is_project_lead(), false))
    with check (coalesce(is_project_lead(), false));

-- ---------------------------------------------------------------------------
-- profiles.role - orthogonal to team. Editor|Approver|Viewer.
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists role profile_role_t not null default 'editor';

create index if not exists profiles_role_idx on profiles(role);

comment on column profiles.role is
    'RBAC role independent of team. Editor writes, Approver approves, Viewer reads.';

-- ---------------------------------------------------------------------------
-- decisions.component_id - nullable FK. Keeps existing component_name.
-- ---------------------------------------------------------------------------

alter table decisions add column if not exists component_id text references components(id);

create index if not exists decisions_component_id_idx on decisions(component_id);

-- ---------------------------------------------------------------------------
-- rating_criteria - static reference table (RC-1 … RC-6)
-- ---------------------------------------------------------------------------

create table if not exists rating_criteria (
    id                text primary key,
    dimension         text not null,
    green_rule        text not null,
    yellow_rule       text,
    red_rule          text not null,
    weight_percent    integer not null,
    created_at        timestamptz not null default now()
);

comment on table rating_criteria is
    'Fixed 6-dimension rating spec from organiser (Rating_Criteria sheet). Read-only.';

alter table rating_criteria enable row level security;

drop policy if exists rating_criteria_select_all on rating_criteria;
create policy rating_criteria_select_all on rating_criteria
    for select to authenticated using (true);

drop policy if exists rating_criteria_write_lead on rating_criteria;
create policy rating_criteria_write_lead on rating_criteria
    for all to authenticated
    using (coalesce(is_project_lead(), false))
    with check (coalesce(is_project_lead(), false));

insert into rating_criteria (id, dimension, green_rule, yellow_rule, red_rule, weight_percent) values
    ('RC-1', 'Material lifecycle (DiMa)',
        'Status = Active',
        null,
        'Status = Deprecated or material not found', 25),
    ('RC-2', 'Compliance (DiMa)',
        'Compliance = Pass',
        'Compliance pending',
        'Compliance = Fail', 20),
    ('RC-3', 'Lead time (DiMa)',
        'Lead time <= 12 weeks',
        'Lead time 13-20 weeks',
        'Lead time > 20 weeks', 10),
    ('RC-4', 'Visual readiness (VRED)',
        'Rendered and Visual Match',
        'VRED missing or not rendered',
        'VRED Mismatch', 15),
    ('RC-5', 'Approval and RBAC',
        'Approved by Approver role',
        'In-Review by valid role',
        'Approved by non-Approver role', 15),
    ('RC-6', 'Cross-area conflict',
        'No conflict on component',
        'Related conflict on component',
        'Direct incompatible conflict', 15)
on conflict (id) do nothing;
