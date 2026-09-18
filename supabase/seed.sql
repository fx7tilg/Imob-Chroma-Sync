-- Chroma Sync - Hackathon seed v2 (organiser dataset alignment)
--
-- Populates the exact entities the organiser workbook specifies:
--   * 12 users USR-01..USR-12 (4 teams x 3 roles) - password: chroma-demo
--   * 12 components CMP-01..CMP-12 (with zones)
--   * 22 DiMa materials MAT-1001..MAT-1022 (with seeded defects)
--   * 19 VRED rows VRD-001..VRD-019 (VRD-013 = Mismatch)
--   * Rating criteria RC-1..RC-6 (already inserted by migration 20260911000003)
--   * 15 decisions covering every scenario in the organiser's answer key
--
-- All detectors query by relationship, never by literal ID, so this seed
-- can be shuffled without breaking anything.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Users - 4 teams x 3 roles
-- ---------------------------------------------------------------------------

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

    insert into public.profiles (id, full_name, team, role, is_project_lead)
    values (v_id, p_full_name, p_team, p_role, p_is_lead);

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

-- Add demo PKI PIN support: a simple text column to store card PINs for hackathon demo.
alter table public.profiles add column if not exists pki_pin text;

-- Map demo PINs to the seeded users so each user can authenticate via PKI card in the demo.
update public.profiles p set pki_pin = '1001'
 from auth.users u where u.email = 'design.editor@chroma.test' and p.id = u.id;
update public.profiles p set pki_pin = '1002'
 from auth.users u where u.email = 'design.approver@chroma.test' and p.id = u.id;
update public.profiles p set pki_pin = '1003'
 from auth.users u where u.email = 'design.viewer@chroma.test' and p.id = u.id;
update public.profiles p set pki_pin = '1004'
 from auth.users u where u.email = 'engineering.editor@chroma.test' and p.id = u.id;
update public.profiles p set pki_pin = '1005'
 from auth.users u where u.email = 'engineering.approver@chroma.test' and p.id = u.id;
update public.profiles p set pki_pin = '1006'
 from auth.users u where u.email = 'engineering.viewer@chroma.test' and p.id = u.id;
update public.profiles p set pki_pin = '1007'
 from auth.users u where u.email = 'procurement.editor@chroma.test' and p.id = u.id;
update public.profiles p set pki_pin = '1008'
 from auth.users u where u.email = 'procurement.approver@chroma.test' and p.id = u.id;
update public.profiles p set pki_pin = '1009'
 from auth.users u where u.email = 'procurement.viewer@chroma.test' and p.id = u.id;
update public.profiles p set pki_pin = '1010'
 from auth.users u where u.email = 'quality.editor@chroma.test' and p.id = u.id;
update public.profiles p set pki_pin = '1011'
 from auth.users u where u.email = 'quality.approver@chroma.test' and p.id = u.id;
update public.profiles p set pki_pin = '1012'
 from auth.users u where u.email = 'quality.viewer@chroma.test' and p.id = u.id;

-- Admin / generic pins
update public.profiles p set pki_pin = '9999' from auth.users u where u.email = 'admin@chroma.test' and p.id = u.id;
update public.profiles p set pki_pin = '0000' from auth.users u where u.email = 'viewer@chroma.test' and p.id = u.id;

drop function _seed_user(text, text, team_t, profile_role_t, boolean);
