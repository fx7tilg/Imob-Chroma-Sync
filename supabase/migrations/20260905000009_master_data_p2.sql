-- Chroma Sync - Phase 2 MDM
-- Migration 0009: Master Data Management (Suppliers & Business Areas)

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- master_suppliers
-- ---------------------------------------------------------------------------

create table master_suppliers (
    id          uuid primary key default gen_random_uuid(),
    code        text not null unique,
    name        text not null,
    is_active   boolean not null default true,
    created_at  timestamptz not null default now()
);

comment on table master_suppliers is 'MDM: Allowed values for Procurement Supplier.';

alter table master_suppliers enable row level security;

-- Read: all authenticated users
create policy "master_suppliers_select" on master_suppliers
    for select to authenticated using (true);

-- Write: only project leads
create policy "master_suppliers_all" on master_suppliers
    for all to authenticated using (is_project_lead());

-- ---------------------------------------------------------------------------
-- master_business_areas
-- ---------------------------------------------------------------------------

create table master_business_areas (
    id          uuid primary key default gen_random_uuid(),
    code        text not null unique,
    name        text not null,
    parent_id   uuid references master_business_areas(id) on delete restrict,
    is_active   boolean not null default true,
    created_at  timestamptz not null default now()
);

comment on table master_business_areas is 'MDM: Hierarchical nested values for Business Areas.';

alter table master_business_areas enable row level security;

-- Read: all authenticated users
create policy "master_business_areas_select" on master_business_areas
    for select to authenticated using (true);

-- Write: only project leads
create policy "master_business_areas_all" on master_business_areas
    for all to authenticated using (is_project_lead());

-- ---------------------------------------------------------------------------
-- Seed Data
-- ---------------------------------------------------------------------------

insert into master_suppliers (code, name) values
    ('V-00123', 'PolySource GmbH'),
    ('V-00456', 'LeatherWorks Inc'),
    ('V-00789', 'MetalForm Industries'),
    ('V-00999', 'Acme Plastics');

-- For business areas, we need to insert parents first, then children, so we use a DO block.
do $$
declare
    v_vehicle_id uuid;
    v_interior_id uuid;
    v_exterior_id uuid;
begin
    -- Root Level
    insert into master_business_areas (code, name) values ('VEH', 'Vehicle') returning id into v_vehicle_id;
    
    -- Level 1
    insert into master_business_areas (code, name, parent_id) values ('INT', 'Interior', v_vehicle_id) returning id into v_interior_id;
    insert into master_business_areas (code, name, parent_id) values ('EXT', 'Exterior', v_vehicle_id) returning id into v_exterior_id;
    insert into master_business_areas (code, name, parent_id) values ('CHS', 'Chassis', v_vehicle_id);
    insert into master_business_areas (code, name, parent_id) values ('PT', 'Powertrain', v_vehicle_id);
    insert into master_business_areas (code, name, parent_id) values ('EL', 'Electronics', v_vehicle_id);

    -- Level 2 (Children of Interior)
    insert into master_business_areas (code, name, parent_id) values ('INT-FNT', 'Front', v_interior_id);
    insert into master_business_areas (code, name, parent_id) values ('INT-RR', 'Rear', v_interior_id);
    insert into master_business_areas (code, name, parent_id) values ('INT-CKPT', 'Cockpit', v_interior_id);

    -- Level 2 (Children of Exterior)
    insert into master_business_areas (code, name, parent_id) values ('EXT-BDY', 'Body', v_exterior_id);
    insert into master_business_areas (code, name, parent_id) values ('EXT-TRM', 'Trim', v_exterior_id);
end $$;
