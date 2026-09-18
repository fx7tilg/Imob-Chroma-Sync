-- =========================================================================
-- Chroma Sync - Critical UX Overhaul
-- Migration: Master Colour Codes, User Attribution, Versioning, Snapshots,
--            Updated Business Areas, Updated Suppliers, Material Links
--
-- INSTRUCTIONS: Copy-paste this entire file into the Supabase SQL Editor
--               and click "Run".
-- =========================================================================

set search_path = public, extensions;

-- =========================================================================
-- 1. MASTER COLOUR CODES (VW-format OEM palette)
-- =========================================================================

create table if not exists master_colour_codes (
    code        text primary key,
    name        text not null,
    hex_preview text not null,
    finish      text not null check (finish in ('solid','metallic','pearl','matte')),
    category    text not null check (category in ('exterior','interior','universal')),
    is_active   boolean not null default true,
    created_at  timestamptz not null default now()
);

comment on table master_colour_codes is 'MDM: VW-style OEM colour palette with hex previews.';

alter table master_colour_codes enable row level security;

create policy "master_colour_codes_select" on master_colour_codes
    for select to authenticated using (true);

create policy "master_colour_codes_all" on master_colour_codes
    for all to authenticated using (is_project_lead());

-- Seed: Realistic VW Group colour codes
insert into master_colour_codes (code, name, hex_preview, finish, category) values
    -- Exterior Whites / Silvers
    ('LA7W', 'Reflex Silver Metallic',      '#C0C0C8', 'metallic', 'exterior'),
    ('LB9A', 'Pure White',                  '#F5F5F0', 'solid',    'exterior'),
    ('LC9A', 'Deep Black Pearl',            '#0A0A0F', 'pearl',    'exterior'),
    ('LD7X', 'Platinum Grey Metallic',      '#8A8A8E', 'metallic', 'exterior'),
    ('LH1Y', 'Turmeric Yellow Metallic',    '#D4A017', 'metallic', 'exterior'),
    ('LH5X', 'Lapiz Blue Metallic',         '#1E3A5F', 'metallic', 'exterior'),
    ('LH8Z', 'Atlantic Blue Metallic',      '#1B3B6F', 'metallic', 'exterior'),
    ('LP3G', 'Kings Red Metallic',          '#8B1A1A', 'metallic', 'exterior'),
    ('LP5U', 'Sunset Red Metallic',         '#A52A2A', 'metallic', 'exterior'),
    ('LP7V', 'Smokey Grey Metallic',        '#6B6B6E', 'metallic', 'exterior'),
    ('LB5K', 'Ravenna Blue Metallic',       '#2C4A7C', 'metallic', 'exterior'),
    ('LC3Y', 'Bordeaux Red Pearl',          '#4A0020', 'pearl',    'exterior'),
    ('LR7H', 'Limestone Grey Metallic',     '#9C9C96', 'metallic', 'exterior'),
    ('LS9R', 'Oryx White Pearl',            '#FAF0E6', 'pearl',    'exterior'),
    ('LY3D', 'Tornado Red',                 '#CC0000', 'solid',    'exterior'),
    -- Interior Colours
    ('ZE', 'Titan Black',                   '#1A1A1E', 'matte',    'interior'),
    ('ZG', 'Shetland Beige',               '#C8B89A', 'matte',    'interior'),
    ('ZH', 'Storm Grey',                    '#5A5A5E', 'matte',    'interior'),
    ('ZK', 'Marrakesh Brown',              '#6B4226', 'matte',    'interior'),
    ('ZN', 'Moonrock Grey',                '#A0A09A', 'matte',    'interior'),
    -- Universal (can be used both)
    ('LZ9Y', 'Deep Black',                  '#050508', 'solid',    'universal'),
    ('LZ1W', 'Candy White',                 '#FAFAFA', 'solid',    'universal')
on conflict (code) do nothing;


-- =========================================================================
-- 2. ADD linked_colour_code TO MATERIALS
-- =========================================================================

alter table materials add column if not exists linked_colour_code text references master_colour_codes(code);

comment on column materials.linked_colour_code is 'The OEM colour code this material is designed for. Used for mismatch detection.';

-- Update existing materials with proper colour links
update materials set linked_colour_code = 'LZ9Y' where code = 'MAT-1001'; -- ABS Matte Charcoal → Deep Black
update materials set linked_colour_code = 'LP7V' where code = 'MAT-1002'; -- ABS Satin Slate → Smokey Grey
update materials set linked_colour_code = 'LZ9Y' where code = 'MAT-1003'; -- ABS Gloss Obsidian → Deep Black
update materials set linked_colour_code = 'ZH'   where code = 'MAT-1004'; -- PP Textured Basalt → Storm Grey
update materials set linked_colour_code = 'LA7W' where code = 'MAT-1005'; -- PP Smooth Silver → Reflex Silver
update materials set linked_colour_code = 'LB9A' where code = 'MAT-5001'; -- Paint Solar White → Pure White
update materials set linked_colour_code = 'LH5X' where code = 'MAT-5002'; -- Paint Midnight Blue → Lapiz Blue
update materials set linked_colour_code = 'LY3D' where code = 'MAT-5003'; -- Paint Racing Red → Tornado Red
update materials set linked_colour_code = 'LH1Y' where code = 'MAT-5004'; -- Paint Signal Yellow → Turmeric Yellow
update materials set linked_colour_code = 'LP7V' where code = 'MAT-5005'; -- Paint Graphite Metallic → Smokey Grey
update materials set linked_colour_code = 'LH5X' where code = 'MAT-7892'; -- Paint Deep Sapphire → Lapiz Blue
update materials set linked_colour_code = 'ZK'   where code = 'MAT-3001'; -- Leather Nappa Cognac → Marrakesh Brown
update materials set linked_colour_code = 'ZE'   where code = 'MAT-3002'; -- Leather Nappa Onyx → Titan Black
update materials set linked_colour_code = 'ZH'   where code = 'MAT-3003'; -- Alcantara Charcoal → Storm Grey


-- =========================================================================
-- 3. USER ATTRIBUTION + VERSIONING ON DECISIONS
-- =========================================================================

alter table decisions add column if not exists submitted_by uuid references auth.users(id);
alter table decisions add column if not exists submitted_at timestamptz;
alter table decisions add column if not exists version integer not null default 1;


-- =========================================================================
-- 4. DECISION SNAPSHOTS
-- =========================================================================

create table if not exists decision_snapshots (
    id           uuid primary key default gen_random_uuid(),
    decision_id  uuid not null references decisions(id) on delete cascade,
    version      integer not null,
    status       text not null,
    snapshot     jsonb not null,
    created_by   uuid references auth.users(id),
    created_at   timestamptz not null default now()
);

comment on table decision_snapshots is 'Point-in-time snapshots of decisions, auto-captured on status transitions.';

alter table decision_snapshots enable row level security;

create policy "snapshots_select" on decision_snapshots
    for select to authenticated using (true);

create policy "snapshots_insert" on decision_snapshots
    for insert to authenticated with check (true);

-- Index for fast lookups by decision
create index if not exists idx_snapshots_decision on decision_snapshots(decision_id, created_at desc);

-- Auto-snapshot trigger: fires on status change
create or replace function snapshot_on_status_change()
returns trigger
language plpgsql
security definer
as $$
begin
    if OLD.status is distinct from NEW.status then
        insert into decision_snapshots (decision_id, version, status, snapshot, created_by)
        values (
            NEW.id,
            NEW.version,
            NEW.status,
            to_jsonb(NEW),
            NEW.submitted_by  -- best-effort: use the submitter
        );
    end if;
    return NEW;
end;
$$;

drop trigger if exists trg_snapshot_on_status on decisions;
create trigger trg_snapshot_on_status
    after update on decisions
    for each row
    execute function snapshot_on_status_change();


-- =========================================================================
-- 5. UPDATE BUSINESS AREAS - Professional VW Vehicle Zones
-- =========================================================================

-- Remove old child entries that will be replaced
delete from master_business_areas where code in (
    'INT-FNT','INT-RR','INT-CKPT','EXT-BDY','EXT-TRM'
);

-- Insert new professional sub-areas
do $$
declare
    v_interior_id uuid;
    v_exterior_id uuid;
begin
    select id into v_interior_id from master_business_areas where code = 'INT';
    select id into v_exterior_id from master_business_areas where code = 'EXT';

    -- Interior sub-areas
    insert into master_business_areas (code, name, parent_id) values
        ('INT-IP',    'Instrument Panel / Dashboard', v_interior_id),
        ('INT-DP',    'Door Panels',                  v_interior_id),
        ('INT-CC',    'Center Console',               v_interior_id),
        ('INT-HL',    'Headliner',                    v_interior_id),
        ('INT-SEAT',  'Seating',                      v_interior_id),
        ('INT-STEER', 'Steering Wheel / Column',      v_interior_id),
        ('INT-PILL',  'A/B/C Pillar Trim',            v_interior_id)
    on conflict (code) do nothing;

    -- Exterior sub-areas
    insert into master_business_areas (code, name, parent_id) values
        ('EXT-BMP',   'Bumpers / Fascias',            v_exterior_id),
        ('EXT-GRL',   'Grille / Air Intakes',         v_exterior_id),
        ('EXT-MIR',   'Exterior Mirrors',             v_exterior_id),
        ('EXT-BODY',  'Body Panels (Doors, Hood, Trunk)', v_exterior_id),
        ('EXT-MOLD',  'Exterior Trim & Moldings',     v_exterior_id),
        ('EXT-LGT',   'Lighting (Head/Tail/Fog)',     v_exterior_id)
    on conflict (code) do nothing;
end $$;


-- =========================================================================
-- 6. UPDATE SUPPLIERS - Real Tier-1 Names
-- =========================================================================

insert into master_suppliers (code, name) values
    ('V-BASF',     'BASF Coatings GmbH'),
    ('V-LEAR',     'Lear Corporation'),
    ('V-BROSE',    'Brose Fahrzeugteile'),
    ('V-CONTI',    'Continental AG'),
    ('V-MAGNA',    'Magna International'),
    ('V-FAURECIA', 'Faurecia Interior Systems'),
    ('V-EVONIK',   'Evonik Industries'),
    ('V-COVESTRO', 'Covestro AG')
on conflict (code) do nothing;


-- =========================================================================
-- 7. ADD EMAIL TO PROFILES (for user attribution display)
-- =========================================================================

alter table profiles add column if not exists email text;

-- Backfill from auth.users
update profiles p set email = u.email from auth.users u where u.id = p.id;


-- =========================================================================
-- Done! All changes applied.
-- =========================================================================
