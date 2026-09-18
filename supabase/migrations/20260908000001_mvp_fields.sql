-- =========================================================================
-- Chroma Sync - Full MVP Field Overhaul
-- Migration: Add 16 new role-specific fields, master data tables for
--            all dropdowns, delete policies, and rejection editability.
-- =========================================================================

set search_path = public, extensions;

-- =========================================================================
-- 1. NEW COLUMNS ON DECISIONS
-- =========================================================================

-- Design new fields
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS finish_surface text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS design_status text DEFAULT 'wip';

-- Engineering new fields
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS engineering_part_number text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS material_specification text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS manufacturing_process text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS engineering_notes text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS engineering_decision text;

-- Procurement new fields
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR';
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS moq integer;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS rfq_reference text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS supplier_status text DEFAULT 'not_started';
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS procurement_notes text;

-- Quality new fields
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS quality_status text DEFAULT 'pending';
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS inspection_required boolean;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS inspection_result text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS pass_fail text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS defect_issue text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS quality_notes text;


-- =========================================================================
-- 2. MASTER DATA TABLES FOR ALL DROPDOWNS
-- =========================================================================

-- 2a. Finish / Surface options
CREATE TABLE IF NOT EXISTS master_finishes (
    code       text PRIMARY KEY,
    label      text NOT NULL,
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE master_finishes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "master_finishes_select" ON master_finishes FOR SELECT TO authenticated USING (true);
CREATE POLICY "master_finishes_all" ON master_finishes FOR ALL TO authenticated USING (is_project_lead());

INSERT INTO master_finishes (code, label) VALUES
    ('MATTE',        'Matte'),
    ('SATIN',        'Satin'),
    ('GLOSS',        'High Gloss'),
    ('SEMI_GLOSS',   'Semi-Gloss'),
    ('TEXTURED',     'Textured / Grained'),
    ('BRUSHED',      'Brushed Metal'),
    ('CHROME',       'Chrome / Bright Trim'),
    ('SOFT_TOUCH',   'Soft Touch'),
    ('PIANO_BLACK',  'Piano Black'),
    ('WOODGRAIN',    'Wood Grain Veneer')
ON CONFLICT (code) DO NOTHING;

-- 2b. Design Status options
CREATE TABLE IF NOT EXISTS master_design_statuses (
    code       text PRIMARY KEY,
    label      text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE master_design_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "master_design_statuses_select" ON master_design_statuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "master_design_statuses_all" ON master_design_statuses FOR ALL TO authenticated USING (is_project_lead());

INSERT INTO master_design_statuses (code, label, sort_order) VALUES
    ('wip',                   'Work In Progress',           1),
    ('concept_review',        'Concept Review',             2),
    ('ready_for_engineering',  'Ready for Engineering',     3),
    ('on_hold',               'On Hold',                    4),
    ('cancelled',             'Cancelled',                  5)
ON CONFLICT (code) DO NOTHING;

-- 2c. Manufacturing Process options
CREATE TABLE IF NOT EXISTS master_manufacturing_processes (
    code       text PRIMARY KEY,
    label      text NOT NULL,
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE master_manufacturing_processes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "master_mfg_select" ON master_manufacturing_processes FOR SELECT TO authenticated USING (true);
CREATE POLICY "master_mfg_all" ON master_manufacturing_processes FOR ALL TO authenticated USING (is_project_lead());

INSERT INTO master_manufacturing_processes (code, label) VALUES
    ('INJECTION_MOLD',  'Injection Moulding'),
    ('BLOW_MOLD',       'Blow Moulding'),
    ('THERMOFORM',      'Thermoforming'),
    ('EXTRUSION',       'Extrusion'),
    ('STAMPING',        'Metal Stamping'),
    ('DIE_CAST',        'Die Casting'),
    ('CNC',             'CNC Machining'),
    ('PAINTING',        'Paint / Coating'),
    ('LASER_CUT',       'Laser Cutting'),
    ('WELDING',         'Welding / Assembly'),
    ('3D_PRINT',        'Additive Manufacturing (3D Print)'),
    ('HAND_LAYUP',      'Hand Lay-up / Composite')
ON CONFLICT (code) DO NOTHING;

-- 2d. Engineering Decision options
CREATE TABLE IF NOT EXISTS master_engineering_decisions (
    code       text PRIMARY KEY,
    label      text NOT NULL,
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE master_engineering_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "master_eng_dec_select" ON master_engineering_decisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "master_eng_dec_all" ON master_engineering_decisions FOR ALL TO authenticated USING (is_project_lead());

INSERT INTO master_engineering_decisions (code, label) VALUES
    ('APPROVED',            'Approved - Meets all requirements'),
    ('CHANGES_REQUIRED',    'Changes Required - Minor revisions needed'),
    ('REJECTED',            'Rejected - Fundamental issues found'),
    ('CONDITIONAL',         'Conditionally Approved - With deviations')
ON CONFLICT (code) DO NOTHING;

-- 2e. Currency options
CREATE TABLE IF NOT EXISTS master_currencies (
    code       text PRIMARY KEY,
    label      text NOT NULL,
    symbol     text NOT NULL DEFAULT '€',
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE master_currencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "master_currencies_select" ON master_currencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "master_currencies_all" ON master_currencies FOR ALL TO authenticated USING (is_project_lead());

INSERT INTO master_currencies (code, label, symbol) VALUES
    ('EUR', 'Euro',              '€'),
    ('USD', 'US Dollar',         '$'),
    ('GBP', 'British Pound',     '£'),
    ('CNY', 'Chinese Yuan',      '¥'),
    ('JPY', 'Japanese Yen',      '¥'),
    ('KRW', 'Korean Won',        '₩')
ON CONFLICT (code) DO NOTHING;

-- 2f. Supplier Status options
CREATE TABLE IF NOT EXISTS master_supplier_statuses (
    code       text PRIMARY KEY,
    label      text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE master_supplier_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "master_supp_stat_select" ON master_supplier_statuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "master_supp_stat_all" ON master_supplier_statuses FOR ALL TO authenticated USING (is_project_lead());

INSERT INTO master_supplier_statuses (code, label, sort_order) VALUES
    ('not_started',         'Not Started',              1),
    ('rfq_sent',            'RFQ Sent',                 2),
    ('quotation_received',  'Quotation Received',       3),
    ('supplier_selected',   'Supplier Selected',        4),
    ('sourcing_complete',   'Sourcing Complete',         5)
ON CONFLICT (code) DO NOTHING;

-- 2g. Quality Status options
CREATE TABLE IF NOT EXISTS master_quality_statuses (
    code       text PRIMARY KEY,
    label      text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE master_quality_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "master_qual_stat_select" ON master_quality_statuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "master_qual_stat_all" ON master_quality_statuses FOR ALL TO authenticated USING (is_project_lead());

INSERT INTO master_quality_statuses (code, label, sort_order) VALUES
    ('pending',            'Pending Review',          1),
    ('under_inspection',   'Under Inspection',        2),
    ('passed',             'Passed',                  3),
    ('failed',             'Failed',                  4),
    ('re_inspection',      'Re-Inspection Required',  5)
ON CONFLICT (code) DO NOTHING;

-- 2h. Pass/Fail options
CREATE TABLE IF NOT EXISTS master_pass_fail (
    code       text PRIMARY KEY,
    label      text NOT NULL,
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE master_pass_fail ENABLE ROW LEVEL SECURITY;
CREATE POLICY "master_pf_select" ON master_pass_fail FOR SELECT TO authenticated USING (true);
CREATE POLICY "master_pf_all" ON master_pass_fail FOR ALL TO authenticated USING (is_project_lead());

INSERT INTO master_pass_fail (code, label) VALUES
    ('PASS',              'Pass - Meets specification'),
    ('FAIL',              'Fail - Does not meet specification'),
    ('CONDITIONAL_PASS',  'Conditional Pass - With deviation'),
    ('NOT_TESTED',        'Not Yet Tested')
ON CONFLICT (code) DO NOTHING;


-- =========================================================================
-- 3. UPDATED COLUMN GUARD TRIGGER
-- =========================================================================

CREATE OR REPLACE FUNCTION decisions_column_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_team          team_t := current_team();
    v_is_lead       boolean := coalesce(is_project_lead(), false);
    v_is_service    boolean := auth.uid() IS NULL;
    v_ai_changed    boolean;
    v_design_changed boolean;
    v_eng_changed   boolean;
    v_proc_changed  boolean;
    v_qual_changed  boolean;
    v_rejecting_team team_t;
BEGIN
    -- Service role and project leads bypass column rules.
    IF v_is_service OR v_is_lead THEN
        RETURN NEW;
    END IF;

    IF v_team IS NULL THEN
        RAISE EXCEPTION 'user has no team assigned' USING errcode = '42501';
    END IF;

    v_ai_changed :=
        NEW.ai_rating          IS DISTINCT FROM OLD.ai_rating          OR
        NEW.ai_reason          IS DISTINCT FROM OLD.ai_reason          OR
        NEW.ai_flags           IS DISTINCT FROM OLD.ai_flags           OR
        NEW.ai_last_checked_at IS DISTINCT FROM OLD.ai_last_checked_at;

    IF v_ai_changed THEN
        RAISE EXCEPTION 'AI-owned columns can only be written by the AI service'
            USING errcode = '42501';
    END IF;

    v_design_changed :=
        NEW.colour_code             IS DISTINCT FROM OLD.colour_code             OR
        NEW.material_reference      IS DISTINCT FROM OLD.material_reference      OR
        NEW.design_notes            IS DISTINCT FROM OLD.design_notes            OR
        NEW.dima_material_reference IS DISTINCT FROM OLD.dima_material_reference OR
        NEW.vred_render_url         IS DISTINCT FROM OLD.vred_render_url         OR
        NEW.finish_surface          IS DISTINCT FROM OLD.finish_surface          OR
        NEW.design_status           IS DISTINCT FROM OLD.design_status           OR
        NEW.reference_documents     IS DISTINCT FROM OLD.reference_documents;

    v_eng_changed :=
        NEW.feasibility_status       IS DISTINCT FROM OLD.feasibility_status    OR
        NEW.technical_constraints    IS DISTINCT FROM OLD.technical_constraints OR
        NEW.engineering_part_number  IS DISTINCT FROM OLD.engineering_part_number OR
        NEW.material_specification   IS DISTINCT FROM OLD.material_specification OR
        NEW.manufacturing_process    IS DISTINCT FROM OLD.manufacturing_process OR
        NEW.engineering_notes        IS DISTINCT FROM OLD.engineering_notes     OR
        NEW.engineering_decision     IS DISTINCT FROM OLD.engineering_decision;

    v_proc_changed :=
        NEW.supplier             IS DISTINCT FROM OLD.supplier             OR
        NEW.lead_time_days       IS DISTINCT FROM OLD.lead_time_days       OR
        NEW.price_per_unit_cents IS DISTINCT FROM OLD.price_per_unit_cents OR
        NEW.currency             IS DISTINCT FROM OLD.currency             OR
        NEW.moq                  IS DISTINCT FROM OLD.moq                  OR
        NEW.rfq_reference        IS DISTINCT FROM OLD.rfq_reference        OR
        NEW.supplier_status      IS DISTINCT FROM OLD.supplier_status      OR
        NEW.procurement_notes    IS DISTINCT FROM OLD.procurement_notes;

    v_qual_changed :=
        NEW.quality_status       IS DISTINCT FROM OLD.quality_status       OR
        NEW.inspection_required  IS DISTINCT FROM OLD.inspection_required  OR
        NEW.inspection_result    IS DISTINCT FROM OLD.inspection_result    OR
        NEW.pass_fail            IS DISTINCT FROM OLD.pass_fail            OR
        NEW.defect_issue         IS DISTINCT FROM OLD.defect_issue         OR
        NEW.quality_notes        IS DISTINCT FROM OLD.quality_notes;

    -- === REJECTION EDITABILITY ===
    -- When status = 'rejected', allow the rejecting team AND design to edit their fields.
    -- This fixes the bug where only design could edit after a rejection.
    IF OLD.status = 'rejected' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        -- Find which team rejected
        SELECT a.team INTO v_rejecting_team
        FROM approvals a
        WHERE a.decision_id = OLD.id AND a.status = 'rejected'
        LIMIT 1;

        -- Design can always edit design fields when rejected
        IF v_design_changed AND v_team <> 'design' THEN
            RAISE EXCEPTION 'only design team can edit design-owned fields'
                USING errcode = '42501';
        END IF;

        -- The rejecting team can edit their own fields
        IF v_eng_changed AND v_team <> 'engineering' THEN
            IF NOT (v_team = 'design' AND v_rejecting_team = 'engineering') THEN
                RAISE EXCEPTION 'only engineering team can edit engineering-owned fields'
                    USING errcode = '42501';
            END IF;
        END IF;

        IF v_proc_changed AND v_team <> 'procurement' THEN
            IF NOT (v_team = 'design' AND v_rejecting_team = 'procurement') THEN
                RAISE EXCEPTION 'only procurement team can edit procurement-owned fields'
                    USING errcode = '42501';
            END IF;
        END IF;

        IF v_qual_changed AND v_team <> 'quality' THEN
            RAISE EXCEPTION 'only quality team can edit quality-owned fields'
                USING errcode = '42501';
        END IF;

        RETURN NEW;
    END IF;

    -- === STANDARD COLUMN OWNERSHIP (non-rejected state) ===
    IF v_design_changed AND v_team <> 'design' THEN
        RAISE EXCEPTION 'only design team can edit design-owned fields'
            USING errcode = '42501';
    END IF;

    IF v_eng_changed AND v_team <> 'engineering' THEN
        RAISE EXCEPTION 'only engineering team can edit engineering-owned fields'
            USING errcode = '42501';
    END IF;

    IF v_proc_changed AND v_team <> 'procurement' THEN
        RAISE EXCEPTION 'only procurement team can edit procurement-owned fields'
            USING errcode = '42501';
    END IF;

    IF v_qual_changed AND v_team <> 'quality' THEN
        RAISE EXCEPTION 'only quality team can edit quality-owned fields'
            USING errcode = '42501';
    END IF;

    -- Status transitions
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF OLD.status = 'draft' AND NEW.status = 'submitted' THEN
            IF v_team <> 'design' THEN
                RAISE EXCEPTION 'only design can submit a draft' USING errcode = '42501';
            END IF;
        ELSIF OLD.status = 'submitted' AND NEW.status = 'under_review' THEN
            IF v_team = 'quality' THEN
                RAISE EXCEPTION 'quality cannot move submitted -> under_review'
                    USING errcode = '42501';
            END IF;
        ELSIF OLD.status = 'under_review' AND NEW.status IN ('approved','rejected') THEN
            IF v_team <> 'quality' THEN
                RAISE EXCEPTION 'only quality can approve or reject' USING errcode = '42501';
            END IF;
        ELSIF OLD.status = 'rejected' AND NEW.status = 'draft' THEN
            IF v_team <> 'design' THEN
                RAISE EXCEPTION 'only design can reopen a rejected decision' USING errcode = '42501';
            END IF;
        ELSE
            RAISE EXCEPTION 'invalid status transition: % -> %', OLD.status, NEW.status
                USING errcode = '42501';
        END IF;
    END IF;

    -- Immutable fields
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'created_by is immutable' USING errcode = '42501';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'created_at is immutable' USING errcode = '42501';
    END IF;
    IF NEW.owner_team IS DISTINCT FROM OLD.owner_team THEN
        RAISE EXCEPTION 'owner_team is immutable' USING errcode = '42501';
    END IF;

    RETURN NEW;
END;
$$;


-- =========================================================================
-- 4. DELETE POLICIES
-- =========================================================================

-- Designer can delete their own drafts
CREATE POLICY decisions_delete_own_draft ON decisions
    FOR DELETE TO authenticated
    USING (
        created_by = auth.uid()
        AND status = 'draft'
        AND current_team() = 'design'
    );

-- Team Lead can delete any decision
CREATE POLICY decisions_delete_lead ON decisions
    FOR DELETE TO authenticated
    USING (is_project_lead());


-- =========================================================================
-- Done! All MVP field overhaul changes applied.
-- =========================================================================
