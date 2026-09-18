-- Migration: 20260914000001_add_model_year.sql
-- Description: Adds model_year column to handle configuration management and time-based conflicts.

set search_path = public, extensions;

ALTER TABLE decisions ADD COLUMN model_year text;
ALTER TABLE decision_snapshots ADD COLUMN model_year text;

-- Update column guard to allow Design to edit model_year
CREATE OR REPLACE FUNCTION decisions_column_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_team          team_t := current_team();
    v_is_lead       boolean := coalesce(is_project_lead(), false);
    v_is_service    boolean := auth.uid() IS NULL;
    v_ai_bypass     boolean := coalesce(current_setting('app.ai_write', true), '') = 'on';
    v_ai_changed    boolean;
    v_design_changed boolean;
    v_eng_changed   boolean;
    v_proc_changed  boolean;
    v_qual_changed  boolean;
    v_rejecting_team team_t;
    v_user_role     text;
BEGIN
    IF v_is_service OR v_is_lead OR v_ai_bypass THEN
        RETURN NEW;
    END IF;

    IF v_team IS NULL THEN
        RAISE EXCEPTION 'user has no team assigned' USING errcode = '42501';
    END IF;

    v_ai_changed :=
        NEW.ai_rating          IS DISTINCT FROM OLD.ai_rating          OR
        NEW.ai_reason          IS DISTINCT FROM OLD.ai_reason          OR
        NEW.ai_flags           IS DISTINCT FROM OLD.ai_flags           OR
        NEW.ai_last_checked_at IS DISTINCT FROM OLD.ai_last_checked_at OR
        NEW.rc1_lifecycle      IS DISTINCT FROM OLD.rc1_lifecycle      OR
        NEW.rc2_compliance     IS DISTINCT FROM OLD.rc2_compliance     OR
        NEW.rc3_lead_time      IS DISTINCT FROM OLD.rc3_lead_time      OR
        NEW.rc4_visual         IS DISTINCT FROM OLD.rc4_visual         OR
        NEW.rc5_approval_rbac  IS DISTINCT FROM OLD.rc5_approval_rbac  OR
        NEW.rc6_conflict       IS DISTINCT FROM OLD.rc6_conflict       OR
        NEW.rc_flags           IS DISTINCT FROM OLD.rc_flags;

    IF v_ai_changed THEN
        RAISE EXCEPTION 'AI-owned columns can only be written by the AI service'
            USING errcode = '42501';
    END IF;

    v_design_changed :=
        NEW.model_year              IS DISTINCT FROM OLD.model_year              OR
        NEW.colour_code             IS DISTINCT FROM OLD.colour_code             OR
        NEW.material_reference      IS DISTINCT FROM OLD.material_reference      OR
        NEW.design_notes            IS DISTINCT FROM OLD.design_notes            OR
        NEW.dima_material_reference IS DISTINCT FROM OLD.dima_material_reference OR
        NEW.vred_render_url         IS DISTINCT FROM OLD.vred_render_url         OR
        NEW.finish_surface          IS DISTINCT FROM OLD.finish_surface          OR
        NEW.design_status           IS DISTINCT FROM OLD.design_status           OR
        NEW.required_temp_min_c     IS DISTINCT FROM OLD.required_temp_min_c     OR
        NEW.required_temp_max_c     IS DISTINCT FROM OLD.required_temp_max_c     OR
        NEW.uv_weathering_required  IS DISTINCT FROM OLD.uv_weathering_required  OR
        NEW.chemical_resistance_required IS DISTINCT FROM OLD.chemical_resistance_required OR
        NEW.reference_documents     IS DISTINCT FROM OLD.reference_documents;

    v_eng_changed :=
        NEW.feasibility_status       IS DISTINCT FROM OLD.feasibility_status    OR
        NEW.technical_constraints    IS DISTINCT FROM OLD.technical_constraints OR
        NEW.engineering_part_number  IS DISTINCT FROM OLD.engineering_part_number OR
        NEW.material_specification   IS DISTINCT FROM OLD.material_specification OR
        NEW.manufacturing_process    IS DISTINCT FROM OLD.manufacturing_process OR
        NEW.engineering_notes        IS DISTINCT FROM OLD.engineering_notes     OR
        NEW.engineering_decision     IS DISTINCT FROM OLD.engineering_decision    OR
        NEW.temp_validation_status   IS DISTINCT FROM OLD.temp_validation_status OR
        NEW.temp_validation_notes    IS DISTINCT FROM OLD.temp_validation_notes OR
        NEW.uv_validation_status     IS DISTINCT FROM OLD.uv_validation_status OR
        NEW.uv_validation_notes      IS DISTINCT FROM OLD.uv_validation_notes OR
        NEW.chemical_validation_status IS DISTINCT FROM OLD.chemical_validation_status OR
        NEW.chemical_validation_notes  IS DISTINCT FROM OLD.chemical_validation_notes OR
        NEW.engineering_owner_id     IS DISTINCT FROM OLD.engineering_owner_id;

    v_proc_changed :=
        NEW.supplier             IS DISTINCT FROM OLD.supplier             OR
        NEW.lead_time_days       IS DISTINCT FROM OLD.lead_time_days       OR
        NEW.price_per_unit_cents IS DISTINCT FROM OLD.price_per_unit_cents OR
        NEW.currency             IS DISTINCT FROM OLD.currency             OR
        NEW.moq                  IS DISTINCT FROM OLD.moq                  OR
        NEW.rfq_reference        IS DISTINCT FROM OLD.rfq_reference        OR
        NEW.supplier_status      IS DISTINCT FROM OLD.supplier_status      OR
        NEW.procurement_notes    IS DISTINCT FROM OLD.procurement_notes    OR
        NEW.procurement_decision IS DISTINCT FROM OLD.procurement_decision OR
        NEW.procurement_owner_id IS DISTINCT FROM OLD.procurement_owner_id;

    v_qual_changed :=
        NEW.quality_status       IS DISTINCT FROM OLD.quality_status       OR
        NEW.inspection_required  IS DISTINCT FROM OLD.inspection_required  OR
        NEW.inspection_result    IS DISTINCT FROM OLD.inspection_result    OR
        NEW.pass_fail            IS DISTINCT FROM OLD.pass_fail            OR
        NEW.defect_issue         IS DISTINCT FROM OLD.defect_issue         OR
        NEW.quality_notes        IS DISTINCT FROM OLD.quality_notes        OR
        NEW.quality_decision     IS DISTINCT FROM OLD.quality_decision     OR
        NEW.quality_owner_id     IS DISTINCT FROM OLD.quality_owner_id;

    -- === GAP-7: TAKE OVER / OWNERSHIP LOCKS - only editors/leads can take over ===
    IF NEW.engineering_owner_id IS DISTINCT FROM OLD.engineering_owner_id THEN
        IF NEW.engineering_owner_id IS NOT NULL THEN
            IF NEW.engineering_owner_id <> auth.uid() THEN
                RAISE EXCEPTION 'you can only take over a decision for yourself'
                    USING errcode = '42501';
            END IF;
            -- Verify the user has editor role
            SELECT role INTO v_user_role FROM profiles WHERE id = auth.uid();
            IF v_user_role IS DISTINCT FROM 'editor' AND v_user_role IS DISTINCT FROM 'admin' THEN
                RAISE EXCEPTION 'only editors can take over form ownership (your role: %)', v_user_role
                    USING errcode = '42501';
            END IF;
        END IF;
    END IF;

    IF NEW.procurement_owner_id IS DISTINCT FROM OLD.procurement_owner_id THEN
        IF NEW.procurement_owner_id IS NOT NULL THEN
            IF NEW.procurement_owner_id <> auth.uid() THEN
                RAISE EXCEPTION 'you can only take over a decision for yourself'
                    USING errcode = '42501';
            END IF;
            SELECT role INTO v_user_role FROM profiles WHERE id = auth.uid();
            IF v_user_role IS DISTINCT FROM 'editor' AND v_user_role IS DISTINCT FROM 'admin' THEN
                RAISE EXCEPTION 'only editors can take over form ownership (your role: %)', v_user_role
                    USING errcode = '42501';
            END IF;
        END IF;
    END IF;

    IF NEW.quality_owner_id IS DISTINCT FROM OLD.quality_owner_id THEN
        IF NEW.quality_owner_id IS NOT NULL THEN
            IF NEW.quality_owner_id <> auth.uid() THEN
                RAISE EXCEPTION 'you can only take over a decision for yourself'
                    USING errcode = '42501';
            END IF;
            SELECT role INTO v_user_role FROM profiles WHERE id = auth.uid();
            IF v_user_role IS DISTINCT FROM 'editor' AND v_user_role IS DISTINCT FROM 'admin' THEN
                RAISE EXCEPTION 'only editors can take over form ownership (your role: %)', v_user_role
                    USING errcode = '42501';
            END IF;
        END IF;
    END IF;

    -- Existing ownership lock: only the current owner can edit their team's fields
    IF OLD.engineering_owner_id IS NOT NULL THEN
        IF v_eng_changed AND OLD.engineering_owner_id <> auth.uid() THEN
            RAISE EXCEPTION 'only the engineering owner (%) can edit engineering fields',
                OLD.engineering_owner_id USING errcode = '42501';
        END IF;
    END IF;

    IF OLD.procurement_owner_id IS NOT NULL THEN
        IF v_proc_changed AND OLD.procurement_owner_id <> auth.uid() THEN
            RAISE EXCEPTION 'only the procurement owner (%) can edit procurement fields',
                OLD.procurement_owner_id USING errcode = '42501';
        END IF;
    END IF;

    IF OLD.quality_owner_id IS NOT NULL THEN
        IF v_qual_changed AND OLD.quality_owner_id <> auth.uid() THEN
            RAISE EXCEPTION 'only the quality owner (%) can edit quality fields',
                OLD.quality_owner_id USING errcode = '42501';
        END IF;
    END IF;

    -- === REJECTION EDITABILITY ===
    IF OLD.status = 'rejected' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        SELECT a.team INTO v_rejecting_team
        FROM approvals a
        WHERE a.decision_id = OLD.id AND a.status = 'rejected'
        LIMIT 1;

        IF v_design_changed AND v_team <> 'design' THEN
            RAISE EXCEPTION 'only design team can edit design-owned fields'
                USING errcode = '42501';
        END IF;

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

    -- === STANDARD COLUMN OWNERSHIP ===
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

    -- === STATUS TRANSITIONS ===
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
        ELSIF OLD.status = 'submitted' AND NEW.status = 'rejected' THEN
            NULL;
        ELSIF OLD.status = 'under_review' AND NEW.status IN ('approved','rejected') THEN
            IF v_team <> 'quality' THEN
                RAISE EXCEPTION 'only quality can approve or reject' USING errcode = '42501';
            END IF;
        ELSIF OLD.status = 'rejected' AND NEW.status = 'draft' THEN
            IF v_team <> 'design' THEN
                RAISE EXCEPTION 'only design can reopen a rejected decision'
                    USING errcode = '42501';
            END IF;
        ELSIF OLD.status = 'rejected' AND NEW.status = 'submitted' THEN
            NULL;
        ELSIF OLD.status = NEW.status THEN
            NULL;
        ELSE
            RAISE EXCEPTION 'invalid status transition: % -> %', OLD.status, NEW.status
                USING errcode = '42501';
        END IF;
    END IF;

    -- === IMMUTABLE FIELDS ===
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
