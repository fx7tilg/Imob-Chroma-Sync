-- Migration: 20260908000003_strict_workflow_rejection.sql
-- Description: Simplifies decisions_column_guard to allow any role to edit their own fields at any time (supporting rejection fixes).

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
BEGIN
    -- Service role, project leads, and the set_ai_readiness() RPC bypass column rules.
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
        NEW.reference_documents     IS DISTINCT FROM OLD.reference_documents     OR
        NEW.required_temp_min_c     IS DISTINCT FROM OLD.required_temp_min_c     OR
        NEW.required_temp_max_c     IS DISTINCT FROM OLD.required_temp_max_c     OR
        NEW.uv_weathering_required  IS DISTINCT FROM OLD.uv_weathering_required  OR
        NEW.chemical_resistance_required IS DISTINCT FROM OLD.chemical_resistance_required;

    v_eng_changed :=
        NEW.feasibility_status       IS DISTINCT FROM OLD.feasibility_status    OR
        NEW.technical_constraints    IS DISTINCT FROM OLD.technical_constraints OR
        NEW.engineering_part_number  IS DISTINCT FROM OLD.engineering_part_number OR
        NEW.material_specification   IS DISTINCT FROM OLD.material_specification OR
        NEW.manufacturing_process    IS DISTINCT FROM OLD.manufacturing_process OR
        NEW.engineering_notes        IS DISTINCT FROM OLD.engineering_notes     OR
        NEW.engineering_decision     IS DISTINCT FROM OLD.engineering_decision  OR
        NEW.temp_validation_status   IS DISTINCT FROM OLD.temp_validation_status OR
        NEW.temp_validation_notes    IS DISTINCT FROM OLD.temp_validation_notes  OR
        NEW.uv_validation_status     IS DISTINCT FROM OLD.uv_validation_status   OR
        NEW.uv_validation_notes      IS DISTINCT FROM OLD.uv_validation_notes    OR
        NEW.chemical_validation_status IS DISTINCT FROM OLD.chemical_validation_status OR
        NEW.chemical_validation_notes  IS DISTINCT FROM OLD.chemical_validation_notes;

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

    -- === STANDARD COLUMN OWNERSHIP ===
    -- Notice we no longer use a special "REJECTION EDITABILITY" block.
    -- If a team changes their own fields, it's always allowed (the UI will control UX).
    -- If they try to change another team's fields, it's blocked.
    
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
