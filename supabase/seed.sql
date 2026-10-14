-- Chroma Sync - Hackathon seed as per given data (organiser dataset alignment)
--
-- Populates the exact entities the organiser workbook specifies:
--   * 12 users USR-01..USR-12 (4 teams x 3 roles) - password: chroma-demo (we did this to make things simple)
--   * 12 components CMP-01..CMP-12 (with zones)
--   * 22 DiMa materials MAT-1001..MAT-1022 (with seeded defects)
--   * 19 VRED rows VRD-001..VRD-019 (VRD-013 = Mismatch)
--   * Rating criteria RC-1..RC-6 (already inserted by migration 20260911000003)
--   * 15 decisions covering every scenario in the organiser's answer key
--
-- All detectors query by relationship, never by literal ID, so this seed
-- can be shuffled without breaking anything.
 
set search_path = public, extensions;
 

-- Users - 4 teams x 3 roles

 
create or replace function _seed_user(
    p_email     text,
    p_full_name text,
    p_team      team_t,
    p_role      profile_role_t,
    p_is_lead   boolean default false
) returns uuid
language plpgsql
set search_path = public, extensions
as $$
declare
    v_id uuid;
begin
    select id into v_id from auth.users where email = p_email;
    if v_id is not null then
        update public.profiles
           set full_name = p_full_name, team = p_team, role = p_role, is_project_lead = p_is_lead
         where id = v_id;
        return v_id;
    end if;
 
    v_id := gen_random_uuid();
 
    insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        is_super_admin, confirmation_token, email_change,
        email_change_token_new, recovery_token
    ) values (
        v_id,
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        p_email,
        crypt('chroma-demo', gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', p_full_name),
        false, '', '', '', ''
    );
 
    -- The on_auth_user_created trigger may have already created a bare profile
    -- row, so upsert to fill in role/team/name rather than colliding on the PK.
    insert into public.profiles (id, full_name, team, role, is_project_lead)
    values (v_id, p_full_name, p_team, p_role, p_is_lead)
    on conflict (id) do update set
        full_name       = excluded.full_name,
        team            = excluded.team,
        role            = excluded.role,
        is_project_lead = excluded.is_project_lead;
 
    return v_id;
end;
$$;
 
do $$
declare
    v_dsn_ed  uuid; v_dsn_ap uuid; v_dsn_vw uuid;  -- USR-01..03  design
    v_eng_ed  uuid; v_eng_ap uuid; v_eng_vw uuid;  -- USR-04..06  engineering
    v_prc_ed  uuid; v_prc_ap uuid; v_prc_vw uuid;  -- USR-07..09  procurement
    v_qua_ed  uuid; v_qua_ap uuid; v_qua_vw uuid;  -- USR-10..12  quality
    v_dec     uuid;
begin
    v_dsn_ed := _seed_user('design.editor@chroma.test',       'Dana Design (Editor)',       'design',       'editor');
    v_dsn_ap := _seed_user('design.approver@chroma.test',     'Derek Design (Approver)',    'design',       'approver');
    v_dsn_vw := _seed_user('design.viewer@chroma.test',       'Deb Design (Viewer)',        'design',       'viewer');
    v_eng_ed := _seed_user('engineering.editor@chroma.test',  'Evan Eng (Editor)',          'engineering',  'editor');
    v_eng_ap := _seed_user('engineering.approver@chroma.test','Emma Eng (Approver)',        'engineering',  'approver');
    v_eng_vw := _seed_user('engineering.viewer@chroma.test',  'Eli Eng (Viewer)',           'engineering',  'viewer');
    v_prc_ed := _seed_user('procurement.editor@chroma.test',  'Priya Proc (Editor)',        'procurement',  'editor');
    v_prc_ap := _seed_user('procurement.approver@chroma.test','Paul Proc (Approver)',       'procurement',  'approver');
    v_prc_vw := _seed_user('procurement.viewer@chroma.test',  'Pia Proc (Viewer)',          'procurement',  'viewer');
    v_qua_ed := _seed_user('quality.editor@chroma.test',      'Quinn Quality (Editor)',     'quality',      'editor');
    v_qua_ap := _seed_user('quality.approver@chroma.test',    'Quan Quality (Approver)',    'quality',      'approver');
    v_qua_vw := _seed_user('quality.viewer@chroma.test',      'Qi Quality (Viewer)',        'quality',      'viewer');
   
    -- Legacy / generic users requested by user
    perform _seed_user('admin@chroma.test', 'System Admin', null, 'editor', true);
    perform _seed_user('viewer@chroma.test', 'Generic Viewer', null, 'viewer');
 
    insert into components (id, name, zone, vehicle_program) values
        ('CMP-01', 'Instrument Panel',    'Interior Upper',   'MEB-Program'),
        ('CMP-02', 'Door Trim (Front)',   'Interior Side',    'MEB-Program'),
        ('CMP-03', 'Seat Cover (Front)',  'Seating',          'MEB-Program'),
        ('CMP-04', 'Steering Wheel',      'Interior Control', 'MEB-Program'),
        ('CMP-05', 'Center Console',      'Interior Central', 'MEB-Program'),
        ('CMP-06', 'Dashboard Insert',    'Interior Upper',   'MEB-Program'),
        ('CMP-07', 'A-Pillar Trim',       'Interior Side',    'MEB-Program'),
        ('CMP-08', 'Headliner',           'Interior Upper',   'MEB-Program'),
        ('CMP-09', 'Gear Selector Knob',  'Interior Control', 'MEB-Program'),
        ('CMP-10', 'Armrest (Center)',    'Interior Central', 'MEB-Program'),
        ('CMP-11', 'Air Vent Surround',   'Interior Upper',   'MEB-Program'),
        ('CMP-12', 'Floor Carpet',        'Flooring',         'MEB-Program')
    on conflict (id) do nothing;
 
    -- Deliberate defects seeded below:
    --   MAT-1004 lifecycle_status = deprecated
    --   MAT-1007 compliance_status = fail
    --   MAT-1010 lifecycle_status = deprecated
    --   MAT-1013 lead_time_weeks  = 24 (> 20)
 
    insert into materials (
        code, display_name, gloss, substrate,
        temperature_min_c, temperature_max_c, compatibility_notes,
        vred_render_url,
        lifecycle_status, compliance_status, lead_time_weeks,
        finish, ral_code, hex_colour, material_type, supplier_code
    ) values
        ('MAT-1001','Moonstone Chrome',        95,'Cr',      -40,150,'PVD chrome, moonstone tone.',                'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','active','pass', 6,'grained','RAL7047','#C8C8C8','chrome','SUP-Beta'),
        ('MAT-1002','Walnut Alcantara',        30,'Textile', -20, 80,'Synthetic suede in walnut.',                 'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','active','pass',10,'satin',  'RAL8011','#5A3A22','alcantara','SUP-Alpha'),
        ('MAT-1003','Walnut Woven Fabric',     25,'Textile', -20, 80,'Woven fabric with walnut base.',             'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','active','pass', 6,'grained','RAL8011','#5A3A22','woven_fabric','SUP-Alpha'),
        ('MAT-1004','Moonstone Alcantara',     20,'Textile', -20, 80,'Deprecated - replaced by MAT-1005.',         'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','deprecated','pass',16,'matte', 'RAL7047','#C8C8C8','alcantara','SUP-Delta'),
        ('MAT-1005','Moonstone Alcantara v2',  30,'Textile', -20, 80,'Alcantara in moonstone, current spec.',      'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','active','pass', 8,'satin',  'RAL7047','#C8C8C8','alcantara','SUP-Beta'),
        ('MAT-1006','Moonstone TPO Plastic',   15,'PP',      -30, 90,'TPO with moonstone finish.',                 'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','active','pass', 6,'grained','RAL7047','#C8C8C8','tpo_plastic','SUP-Delta'),
        ('MAT-1007','Moonstone Leather',       60,'Leather', -10, 60,'Compliance failure: VOC out of spec.',       'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','active','fail', 4,'gloss',  'RAL7047','#C8C8C8','leather','SUP-Gamma'),
        ('MAT-1008','Walnut TPO Plastic',      30,'PP',      -30, 90,'TPO in walnut.',                             'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','active','pass', 8,'satin',  'RAL8011','#5A3A22','tpo_plastic','SUP-Delta'),
        ('MAT-1009','Walnut Chrome',           95,'Cr',      -40,150,'PVD chrome, walnut tone.',                   'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','active','pass',16,'satin',  'RAL8011','#5A3A22','chrome','SUP-Gamma'),
        ('MAT-1010','Walnut Leather',           5,'Leather', -10, 60,'Deprecated - replaced by MAT-1002/1003.',    'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','deprecated','pass',10,'satin', 'RAL8011','#5A3A22','leather','SUP-Delta'),
        ('MAT-1011','Saffron TPO Plastic',     25,'PP',      -30, 90,'Bright saffron TPO.',                        'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','active','pass', 4,'matte',  'RAL1017','#F5A623','tpo_plastic','SUP-Delta'),
        ('MAT-1012','Nappa Beige Leather',      5,'Leather', -10, 60,'Nappa beige, standard leather.',             'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','active','pass',10,'satin',  'RAL1015','#E6D2B5','leather','SUP-Delta'),
        ('MAT-1013','Mistral Grey Chrome',     90,'Cr',      -40,150,'Long-lead chrome (24 weeks).',               'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','active','pass',24,'gloss',  'RAL7037','#7D7F7C','chrome','SUP-Alpha'),
        ('MAT-1014','Nappa Beige Leather HG',  50,'Leather', -10, 60,'Nappa beige, gloss variant.',                'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','active','pass', 4,'gloss',  'RAL1015','#E6D2B5','leather','SUP-Alpha'),
        ('MAT-1015','Ceramique TPO Plastic',   25,'PP',      -30, 90,'Off-white TPO.',                             'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','active','pass', 4,'brushed','RAL9001','#FDF4E3','tpo_plastic','SUP-Gamma'),
        ('MAT-1016','Ocean Blue Wood Veneer',  55,'Veneer',    0, 60,'Blue-tinted veneer.',                        'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','active','pass',12,'gloss',  'RAL5013','#1F3A63','wood_veneer','SUP-Gamma'),
        ('MAT-1017','Walnut Chrome Matte',     20,'Cr',      -40,150,'Chrome with matte walnut wash.',             'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','active','pass', 4,'matte',  'RAL8011','#5A3A22','chrome','SUP-Beta'),
        ('MAT-1018','Crimson Chrome',          70,'Cr',      -40,150,'Deep red chrome.',                           'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','active','pass', 4,'gloss',  'RAL3003','#8B1A1A','chrome','SUP-Delta'),
        ('MAT-1019','Crimson Woven Fabric',    25,'Textile', -20, 80,'Deep red woven fabric.',                     'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','active','pass',10,'satin',  'RAL3003','#8B1A1A','woven_fabric','SUP-Gamma'),
        ('MAT-1020','Moonstone Leather Grain',  8,'Leather', -10, 60,'Grained variant of MAT-1007 (compliant).',   'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','active','pass', 6,'grained','RAL7047','#C8C8C8','leather','SUP-Beta'),
        ('MAT-1021','Ocean Blue TPO Plastic',  25,'PP',      -30, 90,'Deep blue TPO.',                             'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','active','pass', 4,'brushed','RAL5013','#1F3A63','tpo_plastic','SUP-Gamma'),
        ('MAT-1022','Silver Tech Leather',     20,'Leather', -10, 60,'Silver-tone technical leather.',             'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?auto=format&fit=crop&q=80&w=800','active','pass', 4,'matte',  'RAL9006','#A5A5A5','leather','SUP-Alpha')
    on conflict (code) do update set
        lifecycle_status  = excluded.lifecycle_status,
        compliance_status = excluded.compliance_status,
        lead_time_weeks   = excluded.lead_time_weeks,
        finish            = excluded.finish,
        ral_code          = excluded.ral_code,
        hex_colour        = excluded.hex_colour,
        material_type     = excluded.material_type,
        supplier_code     = excluded.supplier_code,
        vred_render_url   = excluded.vred_render_url;
 
    insert into vred_visualizations (id, component_id, material_code, scene_reference, render_status, last_rendered, visual_match) values
        ('VRD-001','CMP-01','MAT-1013','scene_cmp01_1', 'rendered','2026-08-06','match'),
        ('VRD-002','CMP-02','MAT-1014','scene_cmp02_2', 'rendered','2026-08-14','match'),
        ('VRD-003','CMP-04','MAT-1015','scene_cmp04_3', 'rendered','2026-08-15','match'),
        ('VRD-004','CMP-05','MAT-1005','scene_cmp05_4', 'rendered','2026-08-30','match'),
        ('VRD-005','CMP-08','MAT-1006','scene_cmp08_5', 'rendered','2026-08-23','match'),
        ('VRD-006','CMP-11','MAT-1016','scene_cmp11_6', 'rendered','2026-07-30','match'),
        ('VRD-007','CMP-12','MAT-1011','scene_cmp12_7', 'rendered','2026-08-25','match'),
        ('VRD-008','CMP-10','MAT-1021','scene_cmp10_8', 'rendered','2026-09-04','match'),
        ('VRD-009','CMP-06','MAT-1013','scene_cmp06_9', 'rendered','2026-07-31','match'),
        ('VRD-010','CMP-09','MAT-1004','scene_cmp09_10','rendered','2026-08-24','match'),
        ('VRD-011','CMP-03','MAT-1007','scene_cmp03_11','rendered','2026-08-29','match'),
        ('VRD-012','CMP-11','MAT-1017','scene_cmp11_12','rendered','2026-09-01','match'),
        ('VRD-013','CMP-04','MAT-1020','scene_cmp04_13','rendered','2026-08-20','mismatch'),
        ('VRD-014','CMP-02','MAT-1001','scene_cmp02_14','rendered','2026-07-31','match'),
        ('VRD-015','CMP-02','MAT-1011','scene_cmp02_15','rendered','2026-08-23','match'),
        ('VRD-016','CMP-01','MAT-1010','scene_cmp01_16','rendered','2026-08-07','match'),
        ('VRD-017','CMP-01','MAT-1005','scene_cmp01_17','rendered','2026-08-25','match'),
        ('VRD-018','CMP-10','MAT-1001','scene_cmp10_18','rendered','2026-08-22','match'),
        ('VRD-019','CMP-10','MAT-1005','scene_cmp10_19','rendered','2026-08-23','match')
    on conflict (id) do update set
        component_id  = excluded.component_id,
        material_code = excluded.material_code,
        render_status = excluded.render_status,
        last_rendered = excluded.last_rendered,
        visual_match  = excluded.visual_match;
 
    -- ---- Decisions block removed for fresh testing -----------------------
 
end $$;
 
-- Demo PKI card PINs. These live in demo_pki_pins (RLS enabled, no policies -
-- reachable only by service_role via the pki-auth function), NOT on profiles,
-- which every authenticated user can read.
insert into public.demo_pki_pins (profile_id, pin)
select u.id, v.pin
  from (values
    ('design.editor@chroma.test',        '1001'),
    ('design.approver@chroma.test',      '1002'),
    ('design.viewer@chroma.test',        '1003'),
    ('engineering.editor@chroma.test',   '1004'),
    ('engineering.approver@chroma.test', '1005'),
    ('engineering.viewer@chroma.test',   '1006'),
    ('procurement.editor@chroma.test',   '1007'),
    ('procurement.approver@chroma.test', '1008'),
    ('procurement.viewer@chroma.test',   '1009'),
    ('quality.editor@chroma.test',       '1010'),
    ('quality.approver@chroma.test',     '1011'),
    ('quality.viewer@chroma.test',       '1012'),
    ('admin@chroma.test',                '9999'),
    ('viewer@chroma.test',               '0000')
  ) as v(email, pin)
  join auth.users u on u.email = v.email
on conflict (profile_id) do update set pin = excluded.pin;

-- ---------------------------------------------------------------------------
-- Decisions - 15 scenarios covering the organiser answer key
-- ---------------------------------------------------------------------------
-- Every rating criterion RC1-RC6 and every workflow state is represented. All
-- component / material / VRED references point at rows seeded above, so the
-- deterministic scorer reproduces the ratings written at the bottom of this
-- block.
--
--   D-01  CMP-01  green    approved      all six criteria pass
--   D-02  CMP-10  green    approved      conflict baseline for D-15
--   D-03  CMP-07  yellow   under_review  MAT-1009 16-week lead time, no VRED
--   D-04  CMP-11  yellow   submitted     clean, still awaiting approvals
--   D-05  CMP-09  red      rejected      MAT-1004 deprecated           (RC1)
--   D-06  CMP-03  red      rejected      MAT-1007 compliance fail      (RC2)
--   D-07  CMP-06  red      under_review  MAT-1013 24-week lead time    (RC3)
--   D-08  CMP-04  red      submitted     VRD-013 visual mismatch       (RC4)
--   D-09  CMP-05  green    approved      conflict baseline for D-10
--   D-10  CMP-05  red      submitted     colour conflict vs D-09       (RC6)
--   D-11  CMP-02  green    approved      conflict baseline for D-12
--   D-12  CMP-02  yellow   under_review  material conflict vs D-11     (RC6)
--   D-13  CMP-12  unrated  draft         never submitted, no AI check yet
--   D-14  CMP-08  yellow   submitted     version 2 after a rejection
--   D-15  CMP-10  red      submitted     finish conflict vs D-02       (RC6)
--
-- Required temperature windows are set to the DiMa window of the chosen
-- material so the engineering validation genuinely passes.

do $$
declare
    v_dsn_ed uuid; v_dsn_ap uuid;
    v_eng_ed uuid; v_eng_ap uuid;
    v_prc_ed uuid; v_prc_ap uuid;
    v_qua_ed uuid; v_qua_ap uuid;
    v_now    timestamptz := now();
begin
    select id into v_dsn_ed from auth.users where email = 'design.editor@chroma.test';
    select id into v_dsn_ap from auth.users where email = 'design.approver@chroma.test';
    select id into v_eng_ed from auth.users where email = 'engineering.editor@chroma.test';
    select id into v_eng_ap from auth.users where email = 'engineering.approver@chroma.test';
    select id into v_prc_ed from auth.users where email = 'procurement.editor@chroma.test';
    select id into v_prc_ap from auth.users where email = 'procurement.approver@chroma.test';
    select id into v_qua_ed from auth.users where email = 'quality.editor@chroma.test';
    select id into v_qua_ap from auth.users where email = 'quality.approver@chroma.test';

    if v_dsn_ed is null or v_eng_ap is null or v_prc_ap is null or v_qua_ap is null then
        raise exception 'seed users missing - run the user block above first';
    end if;

    -- -- Design content ----------------------------------------------------
    -- Inserted as drafts so the submission triggers below create approvals,
    -- approval_events and snapshots exactly as the application would.

    insert into decisions (
        id, component_id, component_name, business_area, model_year,
        colour_code, material_reference, dima_material_reference, finish_surface,
        design_status, design_notes,
        required_temp_min_c, required_temp_max_c,
        uv_weathering_required, chemical_resistance_required,
        status, owner_team, created_by, created_at, updated_at
    )
    values
    ('dec00001-0000-4000-8000-000000000001', 'CMP-01', 'Instrument Panel',   'Interior Upper',   '2027',
     'LA7W', 'MAT-1005', 'MAT-1005', 'SATIN', 'ready_for_engineering',
     'Moonstone Alcantara v2 across the full upper IP. Replaces the deprecated MAT-1004 spec.',
     -20, 80, 'MODERATE', 'CLEANING_AGENTS',
     'draft', 'design', v_dsn_ed, v_now - interval '28 days', v_now - interval '28 days'),

    ('dec00001-0000-4000-8000-000000000002', 'CMP-10', 'Armrest (Center)',   'Interior Central', '2027',
     'LB9A', 'MAT-1021', 'MAT-1021', 'BRUSHED', 'ready_for_engineering',
     'Ocean Blue TPO with a brushed finish, matched to the console inlay.',
     -30, 90, 'HIGH', 'CLEANING_AGENTS',
     'draft', 'design', v_dsn_ed, v_now - interval '27 days', v_now - interval '27 days'),

    ('dec00001-0000-4000-8000-000000000003', 'CMP-07', 'A-Pillar Trim',      'Interior Side',    '2027',
     'LC9A', 'MAT-1009', 'MAT-1009', 'SATIN', 'ready_for_engineering',
     'Walnut Chrome satin bezel. Long lead time accepted if tooling is reused.',
     -40, 150, 'LOW', 'NONE',
     'draft', 'design', v_dsn_ed, v_now - interval '21 days', v_now - interval '21 days'),

    ('dec00001-0000-4000-8000-000000000004', 'CMP-11', 'Air Vent Surround',  'Interior Upper',   '2027',
     'LH1Y', 'MAT-1016', 'MAT-1016', 'GLOSS', 'ready_for_engineering',
     'Ocean Blue wood veneer surround, gloss sealed.',
     0, 60, 'MODERATE', 'CLEANING_AGENTS',
     'draft', 'design', v_dsn_ed, v_now - interval '9 days', v_now - interval '9 days'),

    ('dec00001-0000-4000-8000-000000000005', 'CMP-09', 'Gear Selector Knob', 'Interior Control', '2027',
     'LD7X', 'MAT-1004', 'MAT-1004', 'MATTE', 'ready_for_engineering',
     'Moonstone Alcantara wrap carried over from the previous model year.',
     -20, 80, 'MODERATE', 'SUNSCREEN_DEET',
     'draft', 'design', v_dsn_ed, v_now - interval '20 days', v_now - interval '20 days'),

    ('dec00001-0000-4000-8000-000000000006', 'CMP-03', 'Seat Cover (Front)', 'Seating',          '2027',
     'LH5X', 'MAT-1007', 'MAT-1007', 'GLOSS', 'ready_for_engineering',
     'Moonstone Leather front seat facing, high gloss piping.',
     -10, 60, 'HIGH', 'SUNSCREEN_DEET',
     'draft', 'design', v_dsn_ed, v_now - interval '19 days', v_now - interval '19 days'),

    ('dec00001-0000-4000-8000-000000000007', 'CMP-06', 'Dashboard Insert',   'Interior Upper',   '2027',
     'LP3G', 'MAT-1013', 'MAT-1013', 'GLOSS', 'ready_for_engineering',
     'Mistral Grey Chrome insert. Premium trim line only.',
     -40, 150, 'MODERATE', 'CLEANING_AGENTS',
     'draft', 'design', v_dsn_ed, v_now - interval '15 days', v_now - interval '15 days'),

    ('dec00001-0000-4000-8000-000000000008', 'CMP-04', 'Steering Wheel',     'Interior Control', '2027',
     'LP5U', 'MAT-1020', 'MAT-1020', 'TEXTURED', 'ready_for_engineering',
     'Moonstone Leather Grain wrap with contrast stitching.',
     -10, 60, 'HIGH', 'SUNSCREEN_DEET',
     'draft', 'design', v_dsn_ed, v_now - interval '7 days', v_now - interval '7 days'),

    ('dec00001-0000-4000-8000-000000000009', 'CMP-05', 'Center Console',     'Interior Central', '2027',
     'LA7W', 'MAT-1005', 'MAT-1005', 'SATIN', 'ready_for_engineering',
     'Console shell in Moonstone Alcantara v2, satin. Reference build for the interior palette.',
     -20, 80, 'MODERATE', 'CLEANING_AGENTS',
     'draft', 'design', v_dsn_ed, v_now - interval '26 days', v_now - interval '26 days'),

    ('dec00001-0000-4000-8000-000000000010', 'CMP-05', 'Center Console',     'Interior Central', '2027',
     'LB9A', 'MAT-1005', 'MAT-1005', 'SATIN', 'ready_for_engineering',
     'Late styling change to the Ocean Blue console colour for the launch edition.',
     -20, 80, 'MODERATE', 'CLEANING_AGENTS',
     'draft', 'design', v_dsn_ed, v_now - interval '5 days', v_now - interval '5 days'),

    ('dec00001-0000-4000-8000-000000000011', 'CMP-02', 'Door Trim (Front)',  'Interior Side',    '2027',
     'LC3Y', 'MAT-1001', 'MAT-1001', 'TEXTURED', 'ready_for_engineering',
     'Front door upper in Moonstone Chrome, grained texture. Reference build.',
     -40, 150, 'MODERATE', 'CLEANING_AGENTS',
     'draft', 'design', v_dsn_ed, v_now - interval '25 days', v_now - interval '25 days'),

    ('dec00001-0000-4000-8000-000000000012', 'CMP-02', 'Door Trim (Front)',  'Interior Side',    '2027',
     'LC3Y', 'MAT-1011', 'MAT-1011', 'TEXTURED', 'ready_for_engineering',
     'Cost-down proposal: same colour and texture, Saffron TPO substrate instead of chrome.',
     -30, 90, 'MODERATE', 'CLEANING_AGENTS',
     'draft', 'design', v_dsn_ed, v_now - interval '4 days', v_now - interval '4 days'),

    ('dec00001-0000-4000-8000-000000000013', 'CMP-12', 'Floor Carpet',       'Flooring',         '2027',
     'LP7V', 'MAT-1011', null, 'MATTE', 'wip',
     'Saffron TPO carpet binding. Still waiting on the acoustic package before submitting.',
     -30, 90, 'LOW', 'ROAD_SALT',
     'draft', 'design', v_dsn_ed, v_now - interval '2 days', v_now - interval '2 days'),

    ('dec00001-0000-4000-8000-000000000014', 'CMP-08', 'Headliner',          'Interior Upper',   '2027',
     'LR7H', 'MAT-1006', 'MAT-1006', 'TEXTURED', 'ready_for_engineering',
     'Moonstone TPO headliner. Resubmitted after the mounting-rib rework requested by Engineering.',
     -30, 90, 'LOW', 'NONE',
     'draft', 'design', v_dsn_ed, v_now - interval '18 days', v_now - interval '18 days'),

    ('dec00001-0000-4000-8000-000000000015', 'CMP-10', 'Armrest (Center)',   'Interior Central', '2027',
     'LB9A', 'MAT-1021', 'MAT-1021', 'MATTE', 'ready_for_engineering',
     'Matte variant of the armrest for the comfort package.',
     -30, 90, 'HIGH', 'CLEANING_AGENTS',
     'draft', 'design', v_dsn_ed, v_now - interval '3 days', v_now - interval '3 days')
    on conflict (id) do nothing;

    -- -- Submission ---------------------------------------------------------
    -- D-13 stays a draft. Everything else is submitted, which fires
    -- ensure_all_team_approvals() and creates the four pending approval rows.

    update decisions
       set status       = 'submitted',
           submitted_by = v_dsn_ed,
           submitted_at = created_at + interval '1 day'
     where id between 'dec00001-0000-4000-8000-000000000001'
                  and 'dec00001-0000-4000-8000-000000000015'
       and id <> 'dec00001-0000-4000-8000-000000000013'
       and status = 'draft';

    -- -- Engineering content -------------------------------------------------

    update decisions set
        feasibility_status         = 'FEASIBLE_STD',
        technical_constraints      = 'NO_CONSTRAINT',
        engineering_part_number    = 'EP-' || right(component_id, 2) || '-0001',
        material_specification     = material_reference || ' / ' || finish_surface,
        manufacturing_process      = 'INJECTION_MOLD',
        engineering_decision       = 'APPROVED',
        engineering_notes          = 'Temperature, UV and chemical windows verified against the DiMa record.',
        temp_validation_status     = 'validated',
        temp_validation_notes      = 'DiMa window covers the requested range.',
        uv_validation_status       = 'validated',
        uv_validation_notes        = 'Xenon-arc result meets the requested class.',
        chemical_validation_status = 'validated',
        chemical_validation_notes  = 'Cleaning-agent exposure passed.',
        engineering_owner_id       = v_eng_ed
    where id in (
        'dec00001-0000-4000-8000-000000000001',
        'dec00001-0000-4000-8000-000000000002',
        'dec00001-0000-4000-8000-000000000003',
        'dec00001-0000-4000-8000-000000000004',
        'dec00001-0000-4000-8000-000000000007',
        'dec00001-0000-4000-8000-000000000009',
        'dec00001-0000-4000-8000-000000000010',
        'dec00001-0000-4000-8000-000000000011',
        'dec00001-0000-4000-8000-000000000012',
        'dec00001-0000-4000-8000-000000000014',
        'dec00001-0000-4000-8000-000000000015'
    );

    -- D-05: deprecated material, Engineering refuses the carry-over.
    update decisions set
        feasibility_status         = 'NOT_FEASIBLE_MATERIAL',
        technical_constraints      = 'WARN_SUPPLY',
        engineering_part_number    = 'EP-09-0001',
        material_specification     = 'MAT-1004 / MATTE',
        manufacturing_process      = 'HAND_LAYUP',
        engineering_decision       = 'REJECTED',
        engineering_notes          = 'MAT-1004 is deprecated in DiMa. Respecify on MAT-1005 before resubmitting.',
        temp_validation_status     = 'validated',
        uv_validation_status       = 'validated',
        chemical_validation_status = 'not_required',
        engineering_owner_id       = v_eng_ed
    where id = 'dec00001-0000-4000-8000-000000000005';

    -- D-06: compliance failure surfaces as a chemical validation failure.
    update decisions set
        feasibility_status         = 'FEASIBLE_CONDITIONAL',
        technical_constraints      = 'WARN_SUPPLY',
        engineering_part_number    = 'EP-03-0001',
        material_specification     = 'MAT-1007 / GLOSS',
        manufacturing_process      = 'HAND_LAYUP',
        engineering_decision       = 'CONDITIONAL',
        engineering_notes          = 'Buildable, but the DiMa compliance record for MAT-1007 is a fail.',
        temp_validation_status     = 'validated',
        uv_validation_status       = 'validated',
        chemical_validation_status = 'failed',
        chemical_validation_notes  = 'Sunscreen/DEET exposure test not passed for MAT-1007.',
        engineering_owner_id       = v_eng_ed
    where id = 'dec00001-0000-4000-8000-000000000006';

    -- D-08: VRED render does not match the specified material.
    update decisions set
        feasibility_status         = 'FEASIBLE_STD',
        technical_constraints      = 'NO_CONSTRAINT',
        engineering_part_number    = 'EP-04-0001',
        material_specification     = 'MAT-1020 / TEXTURED',
        manufacturing_process      = 'HAND_LAYUP',
        engineering_decision       = 'CHANGES_REQUIRED',
        engineering_notes          = 'Geometry is fine. The VRED scene does not match the specified grain.',
        temp_validation_status     = 'validated',
        uv_validation_status       = 'validated',
        chemical_validation_status = 'validated',
        engineering_owner_id       = v_eng_ed
    where id = 'dec00001-0000-4000-8000-000000000008';

    -- -- Procurement content -------------------------------------------------
    -- lead_time_days mirrors the DiMa lead_time_weeks of the chosen material.

    update decisions d set
        supplier             = v.supplier,
        lead_time_days       = v.lead_days,
        price_per_unit_cents = v.price,
        currency             = 'EUR',
        moq                  = v.moq,
        rfq_reference        = v.rfq,
        supplier_status      = v.sup_status,
        procurement_decision = v.proc_decision,
        procurement_notes    = v.notes,
        procurement_owner_id = v_prc_ed
    from (values
        ('dec00001-0000-4000-8000-000000000001'::uuid, 'V-FAURECIA', 56,  4250, 500,  'RFQ-2027-001', 'sourcing_complete',  'APPROVED',         'Single source, tooling amortised.'),
        ('dec00001-0000-4000-8000-000000000002'::uuid, 'V-COVESTRO', 28,  1890, 1000, 'RFQ-2027-002', 'sourcing_complete',  'APPROVED',         'Standard TPO, two qualified sources.'),
        ('dec00001-0000-4000-8000-000000000003'::uuid, 'V-MAGNA',    112, 7310, 250,  'RFQ-2027-003', 'quotation_received', 'CHANGES_REQUIRED', '16-week lead time will not hold the build slot.'),
        ('dec00001-0000-4000-8000-000000000004'::uuid, 'V-EVONIK',   84,  6120, 300,  'RFQ-2027-004', 'supplier_selected',  null,               'Veneer supplier selected, awaiting signed quote.'),
        ('dec00001-0000-4000-8000-000000000005'::uuid, 'V-LEAR',     112, 5400, 400,  'RFQ-2027-005', 'rfq_sent',           null,               'On hold pending the material respecification.'),
        ('dec00001-0000-4000-8000-000000000006'::uuid, 'V-LEAR',     28,  9870, 200,  'RFQ-2027-006', 'quotation_received', 'CHANGES_REQUIRED', 'Quote held until the compliance record clears.'),
        ('dec00001-0000-4000-8000-000000000007'::uuid, 'V-00789',    168, 11240,150,  'RFQ-2027-007', 'quotation_received', 'REJECTED',         '24-week lead time cannot support the launch date.'),
        ('dec00001-0000-4000-8000-000000000008'::uuid, 'V-LEAR',     42,  8150, 300,  'RFQ-2027-008', 'supplier_selected',  null,               'Sourcing agreed, blocked on the visual release.'),
        ('dec00001-0000-4000-8000-000000000009'::uuid, 'V-FAURECIA', 56,  4980, 500,  'RFQ-2027-009', 'sourcing_complete',  'APPROVED',         'Shares the IP tool family.'),
        ('dec00001-0000-4000-8000-000000000010'::uuid, 'V-FAURECIA', 56,  5120, 500,  'RFQ-2027-010', 'quotation_received', null,               'Colour change priced, awaiting the conflict resolution.'),
        ('dec00001-0000-4000-8000-000000000011'::uuid, 'V-BROSE',    42,  6640, 400,  'RFQ-2027-011', 'sourcing_complete',  'APPROVED',         'Chrome bezel, qualified supplier.'),
        ('dec00001-0000-4000-8000-000000000012'::uuid, 'V-COVESTRO', 28,  3180, 800,  'RFQ-2027-012', 'quotation_received', null,               'Cost-down alternative, 52 percent cheaper than the chrome build.'),
        ('dec00001-0000-4000-8000-000000000014'::uuid, 'V-CONTI',    42,  2740, 700,  'RFQ-2027-014', 'supplier_selected',  null,               'Requote after the rib rework, price unchanged.'),
        ('dec00001-0000-4000-8000-000000000015'::uuid, 'V-COVESTRO', 28,  1950, 1000, 'RFQ-2027-015', 'quotation_received', null,               'Same tool as D-02, matte texture plate only.')
    ) as v(id, supplier, lead_days, price, moq, rfq, sup_status, proc_decision, notes)
    where d.id = v.id;

    -- -- Quality content -----------------------------------------------------

    update decisions d set
        quality_status      = v.q_status,
        inspection_required = v.insp_req,
        inspection_result   = v.insp_result,
        pass_fail           = v.pass_fail,
        defect_issue        = v.defect,
        quality_decision    = v.q_decision,
        quality_notes       = v.notes,
        quality_owner_id    = v_qua_ed
    from (values
        ('dec00001-0000-4000-8000-000000000001'::uuid, 'passed',           true,  'Colour and grain within tolerance on three sample parts.', 'PASS',             null,                                    'APPROVED', 'Released for series.'),
        ('dec00001-0000-4000-8000-000000000002'::uuid, 'passed',           true,  'Brushed finish uniform across the armrest radius.',        'PASS',             null,                                    'APPROVED', 'Released for series.'),
        ('dec00001-0000-4000-8000-000000000003'::uuid, 'pending',          true,  null,                                                       'NOT_TESTED',       null,                                    null,       'Waiting for first-off samples.'),
        ('dec00001-0000-4000-8000-000000000004'::uuid, 'pending',          true,  null,                                                       'NOT_TESTED',       null,                                    null,       'Scheduled once the veneer quote is signed.'),
        ('dec00001-0000-4000-8000-000000000005'::uuid, 'pending',          false, null,                                                       'NOT_TESTED',       null,                                    null,       'Not inspected, material respecification required first.'),
        ('dec00001-0000-4000-8000-000000000006'::uuid, 'failed',           true,  'Surface crazing after the DEET exposure cycle.',           'FAIL',             'Chemical resistance below requirement', 'REJECTED', 'Material fails the requested chemical class.'),
        ('dec00001-0000-4000-8000-000000000007'::uuid, 'pending',          true,  null,                                                       'NOT_TESTED',       null,                                    null,       'Blocked on the sourcing decision.'),
        ('dec00001-0000-4000-8000-000000000008'::uuid, 'pending',          true,  null,                                                       'NOT_TESTED',       null,                                    null,       'Cannot sign off while the VRED render disagrees with the spec.'),
        ('dec00001-0000-4000-8000-000000000009'::uuid, 'passed',           true,  'Reference console build accepted as the palette master.',  'PASS',             null,                                    'APPROVED', 'Released for series.'),
        ('dec00001-0000-4000-8000-000000000010'::uuid, 'pending',          true,  null,                                                       'NOT_TESTED',       null,                                    null,       'Held until the colour conflict with the reference build is resolved.'),
        ('dec00001-0000-4000-8000-000000000011'::uuid, 'passed',           true,  'Grain and gloss match the master panel.',                  'PASS',             null,                                    'APPROVED', 'Released for series.'),
        ('dec00001-0000-4000-8000-000000000012'::uuid, 'under_inspection', true,  'Substrate swap under evaluation against the master panel.', 'CONDITIONAL_PASS', null,                                    null,       'Visually equivalent so far, abrasion test outstanding.'),
        ('dec00001-0000-4000-8000-000000000014'::uuid, 'pending',          true,  null,                                                       'NOT_TESTED',       null,                                    null,       'Re-inspection booked for the reworked part.'),
        ('dec00001-0000-4000-8000-000000000015'::uuid, 'pending',          true,  null,                                                       'NOT_TESTED',       null,                                    null,       'Held until the finish conflict with the reference build is resolved.')
    ) as v(id, q_status, insp_req, insp_result, pass_fail, defect, q_decision, notes)
    where d.id = v.id;

    -- -- Workflow progression -------------------------------------------------

    update decisions
       set status = 'under_review'
     where id in ('dec00001-0000-4000-8000-000000000001',
                  'dec00001-0000-4000-8000-000000000002',
                  'dec00001-0000-4000-8000-000000000003',
                  'dec00001-0000-4000-8000-000000000006',
                  'dec00001-0000-4000-8000-000000000007',
                  'dec00001-0000-4000-8000-000000000009',
                  'dec00001-0000-4000-8000-000000000011',
                  'dec00001-0000-4000-8000-000000000012');

    update decisions
       set status = 'approved'
     where id in ('dec00001-0000-4000-8000-000000000001',
                  'dec00001-0000-4000-8000-000000000002',
                  'dec00001-0000-4000-8000-000000000009',
                  'dec00001-0000-4000-8000-000000000011');

    -- D-05 rejected straight out of submission by Engineering,
    -- D-06 rejected by Quality during review.
    update decisions
       set status = 'rejected'
     where id in ('dec00001-0000-4000-8000-000000000005',
                  'dec00001-0000-4000-8000-000000000006');

    -- D-14 was rejected once, reworked by Design and resubmitted as version 2.
    update decisions set status = 'rejected'
     where id = 'dec00001-0000-4000-8000-000000000014';
    update decisions set status = 'draft'
     where id = 'dec00001-0000-4000-8000-000000000014';
    update decisions
       set status       = 'submitted',
           version      = 2,
           submitted_by = v_dsn_ed,
           submitted_at = v_now - interval '6 days'
     where id = 'dec00001-0000-4000-8000-000000000014';

    -- -- Approvals ------------------------------------------------------------
    -- Every approval is cast by a profile whose role is 'approver', which is
    -- what RC5 checks. Rows left pending are the ones still owed.

    update approvals a set
        status      = 'approved',
        approved_by = case a.team
                          when 'design'       then v_dsn_ap
                          when 'engineering'  then v_eng_ap
                          when 'procurement'  then v_prc_ap
                          else v_qua_ap
                      end,
        decided_at  = v_now - interval '10 days',
        notes       = 'Approved.',
        version     = 1
    where a.decision_id in ('dec00001-0000-4000-8000-000000000001',
                            'dec00001-0000-4000-8000-000000000002',
                            'dec00001-0000-4000-8000-000000000009',
                            'dec00001-0000-4000-8000-000000000011');

    update approvals a set
        status      = 'approved',
        approved_by = case a.team when 'design' then v_dsn_ap else v_eng_ap end,
        decided_at  = v_now - interval '8 days',
        notes       = 'Approved, handing over to Procurement.',
        version     = 1
    where a.decision_id in ('dec00001-0000-4000-8000-000000000003',
                            'dec00001-0000-4000-8000-000000000007',
                            'dec00001-0000-4000-8000-000000000012')
      and a.team in ('design', 'engineering');

    update approvals a set
        status      = 'rejected',
        approved_by = v_eng_ap,
        decided_at  = v_now - interval '17 days',
        notes       = 'MAT-1004 is deprecated in DiMa. Respecify on MAT-1005.',
        version     = 1
    where a.decision_id = 'dec00001-0000-4000-8000-000000000005'
      and a.team = 'engineering';

    update approvals a set
        status      = 'rejected',
        approved_by = v_qua_ap,
        decided_at  = v_now - interval '16 days',
        notes       = 'Chemical resistance below the requested class.',
        version     = 1
    where a.decision_id = 'dec00001-0000-4000-8000-000000000006'
      and a.team = 'quality';

    -- -- Conflicts -------------------------------------------------------------
    -- The same rows detect-conflicts would write. The older, approved decision
    -- of each pair is the baseline and is not flagged.

    insert into conflicts (id, decision_a_id, decision_b_id, conflict_type, explanation, detected_at, assigned_team)
    values
    ('c0f00001-0000-4000-8000-000000000001',
     'dec00001-0000-4000-8000-000000000010', 'dec00001-0000-4000-8000-000000000009',
     'colour_code_conflict',
     'Center Console is specified as LB9A here but LA7W on the approved reference build. Two colours cannot ship for the same component and model year.',
     v_now - interval '4 days', 'design'),

    ('c0f00001-0000-4000-8000-000000000002',
     'dec00001-0000-4000-8000-000000000012', 'dec00001-0000-4000-8000-000000000011',
     'material_conflict',
     'Door Trim (Front) uses MAT-1011 here and MAT-1001 on the approved reference build. Same colour and texture, different substrate.',
     v_now - interval '3 days', 'engineering'),

    ('c0f00001-0000-4000-8000-000000000003',
     'dec00001-0000-4000-8000-000000000015', 'dec00001-0000-4000-8000-000000000002',
     'finish_conflict',
     'Armrest (Center) is specified as MATTE here but BRUSHED on the approved reference build.',
     v_now - interval '2 days', 'design')
    on conflict (id) do nothing;

    -- -- AI readiness -----------------------------------------------------------
    -- Deterministic criterion ratings. The LLM only ever writes ai_reason, so
    -- these are the values the scorer reproduces when readiness is re-run.

    update decisions d set
        rc1_lifecycle      = v.rc1::ai_rating_t,
        rc2_compliance     = v.rc2::ai_rating_t,
        rc3_lead_time      = v.rc3::ai_rating_t,
        rc4_visual         = v.rc4::ai_rating_t,
        rc5_approval_rbac  = v.rc5::ai_rating_t,
        rc6_conflict       = v.rc6::ai_rating_t,
        ai_rating          = v.agg::ai_rating_t,
        ai_reason          = v.reason,
        ai_flags           = v.flags::jsonb,
        ai_last_checked_at = v_now - interval '1 hour'
    from (values
        ('dec00001-0000-4000-8000-000000000001'::uuid, 'green','green','green','green','green','green','green',
         'All six criteria pass. MAT-1005 is active and compliant, the 8-week lead time is inside the 12-week threshold, VRD-017 renders a visual match, all four teams approved at the current version and no sibling decision contests this component.',
         '[]'),
        ('dec00001-0000-4000-8000-000000000002'::uuid, 'green','green','green','green','green','green','green',
         'All six criteria pass. MAT-1021 is active and compliant with a 4-week lead time, VRD-008 renders a visual match, and all four approvals are current. A later matte variant exists but this approved build is the baseline.',
         '[]'),
        ('dec00001-0000-4000-8000-000000000003'::uuid, 'green','green','yellow','yellow','yellow','green','yellow',
         'MAT-1009 carries a 16-week lead time, which sits in the 13-to-20 week caution band, and no VRED scene exists for CMP-07 with this material, so visual readiness cannot be confirmed. Procurement and Quality approvals are still outstanding.',
         '[{"flag":"lead_time_risk","detail":"16-week lead time will not hold the current build slot."},{"flag":"vred_missing","detail":"No VRED render for CMP-07 with MAT-1009."}]'),
        ('dec00001-0000-4000-8000-000000000004'::uuid, 'green','green','green','green','yellow','green','yellow',
         'Material, compliance, lead time and visual readiness all pass. The only open item is the review itself: this decision is still awaiting its four team approvals.',
         '[{"flag":"awaiting_approval","detail":"Submitted, no approvals cast yet."}]'),
        ('dec00001-0000-4000-8000-000000000005'::uuid, 'red','green','yellow','green','yellow','green','red',
         'MAT-1004 is marked deprecated in DiMa, which blocks the decision outright. Its 16-week lead time is also in the caution band. Engineering has rejected the carry-over and asked for a respecification on MAT-1005.',
         '[{"flag":"material_deprecated","detail":"MAT-1004 is deprecated in DiMa."},{"flag":"lead_time_risk","detail":"16-week lead time."}]'),
        ('dec00001-0000-4000-8000-000000000006'::uuid, 'green','red','green','green','yellow','green','red',
         'The DiMa compliance record for MAT-1007 is a fail, and the Quality inspection confirmed surface crazing after DEET exposure. The material cannot be released for the requested chemical class.',
         '[{"flag":"compliance_fail","detail":"MAT-1007 compliance status is fail in DiMa."},{"flag":"inspection_failed","detail":"Chemical resistance below requirement."}]'),
        ('dec00001-0000-4000-8000-000000000007'::uuid, 'green','green','red','green','yellow','green','red',
         'MAT-1013 has a 24-week lead time, well beyond the 20-week limit, and Procurement has rejected the sourcing on that basis. Material status, compliance and the VRD-009 render are all clean.',
         '[{"flag":"lead_time_blocker","detail":"24-week lead time cannot support the launch date."}]'),
        ('dec00001-0000-4000-8000-000000000008'::uuid, 'green','green','green','red','yellow','green','red',
         'VRD-013 renders CMP-04 with MAT-1020 as a visual mismatch, so the specified grain does not match the released scene. Material lifecycle, compliance and lead time are all clean.',
         '[{"flag":"vred_mismatch","detail":"VRD-013 reports visual_match = mismatch."}]'),
        ('dec00001-0000-4000-8000-000000000009'::uuid, 'green','green','green','green','green','green','green',
         'All six criteria pass. This is the approved reference build for the interior palette and is treated as the baseline for the Center Console colour.',
         '[]'),
        ('dec00001-0000-4000-8000-000000000010'::uuid, 'green','green','green','green','yellow','red','red',
         'The material itself is clean, but this decision specifies LB9A for a component already approved in LA7W. Two colours cannot ship for the same component and model year, and this is the later of the two, so it carries the conflict.',
         '[{"flag":"colour_conflict","detail":"LB9A here versus LA7W on the approved reference build."}]'),
        ('dec00001-0000-4000-8000-000000000011'::uuid, 'green','green','green','green','green','green','green',
         'All six criteria pass. This is the approved reference build for the front door upper and is the baseline for the substrate comparison.',
         '[]'),
        ('dec00001-0000-4000-8000-000000000012'::uuid, 'green','green','green','green','yellow','yellow','yellow',
         'A substrate difference against the approved reference build: MAT-1011 here versus MAT-1001 there, with the same colour and texture. That is a soft conflict rather than a blocker, and the review is still open.',
         '[{"flag":"material_conflict","detail":"MAT-1011 here versus MAT-1001 on the approved reference build."}]'),
        ('dec00001-0000-4000-8000-000000000014'::uuid, 'green','green','green','green','yellow','green','yellow',
         'Version 2 after the mounting-rib rework. Material, compliance, lead time and the VRD-005 render all pass; the approvals were reset by the resubmission and are still outstanding.',
         '[{"flag":"awaiting_approval","detail":"Approvals reset by resubmission at version 2."}]'),
        ('dec00001-0000-4000-8000-000000000015'::uuid, 'green','green','green','green','yellow','red','red',
         'The material is clean, but this decision specifies a MATTE finish for a component already approved as BRUSHED. Finish is a hard conflict and this is the later of the two decisions.',
         '[{"flag":"finish_conflict","detail":"MATTE here versus BRUSHED on the approved reference build."}]')
    ) as v(id, rc1, rc2, rc3, rc4, rc5, rc6, agg, reason, flags)
    where d.id = v.id;

    -- Per-criterion evidence, in the shape lib/ai.ts writes it.
    update decisions set rc_flags = jsonb_build_object(
        'rc1_lifecycle', jsonb_build_object(
            'reason', case rc1_lifecycle
                        when 'green' then 'Material is active in DiMa.'
                        when 'yellow' then 'Material lifecycle could not be confirmed.'
                        else 'Material is deprecated or absent from DiMa.' end,
            'evidence', jsonb_build_object('material', material_reference)),
        'rc2_compliance', jsonb_build_object(
            'reason', case rc2_compliance
                        when 'green' then 'DiMa compliance status is pass.'
                        when 'yellow' then 'DiMa compliance status is pending.'
                        else 'DiMa compliance status is fail.' end,
            'evidence', jsonb_build_object('material', material_reference)),
        'rc3_lead_time', jsonb_build_object(
            'reason', case rc3_lead_time
                        when 'green' then 'Lead time is within 12 weeks.'
                        when 'yellow' then 'Lead time is between 13 and 20 weeks.'
                        else 'Lead time exceeds 20 weeks.' end,
            'evidence', jsonb_build_object('lead_time_days', lead_time_days)),
        'rc4_visual', jsonb_build_object(
            'reason', case rc4_visual
                        when 'green' then 'A rendered VRED scene reports a visual match.'
                        when 'yellow' then 'No rendered VRED scene for this component and material.'
                        else 'The VRED scene reports a visual mismatch.' end,
            'evidence', jsonb_build_object('component', component_id, 'material', material_reference)),
        'rc5_approval_rbac', jsonb_build_object(
            'reason', case rc5_approval_rbac
                        when 'green' then 'All four approvals were cast by approver-role users at the current version.'
                        when 'yellow' then 'Approvals are still outstanding for the current version.'
                        else 'An approval was cast by a user without the approver role.' end,
            'evidence', jsonb_build_object('status', status, 'version', version)),
        'rc6_conflict', jsonb_build_object(
            'reason', case rc6_conflict
                        when 'green' then 'No competing decision for this component and model year.'
                        when 'yellow' then 'A soft material difference exists against the baseline decision.'
                        else 'A hard colour or finish conflict exists against the baseline decision.' end,
            'evidence', jsonb_build_object('component', component_id, 'model_year', model_year))
    )
    where rc1_lifecycle is not null;
end $$;

drop function _seed_user(text, text, team_t, profile_role_t, boolean);