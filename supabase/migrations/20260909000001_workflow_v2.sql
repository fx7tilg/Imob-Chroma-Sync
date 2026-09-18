-- Migration: 20260909000001_workflow_v2.sql
-- Description: Version-aware approvals, approval event history, and fixed status transitions.
-- This is the core workflow-v2 migration for the hackathon MVP.

-- =========================================================================
-- 1. APPROVAL EVENTS TABLE (lightweight audit history for approvals)
-- =========================================================================

CREATE TABLE IF NOT EXISTS approval_events (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id  uuid NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
    version      integer NOT NULL DEFAULT 1,
    team         team_t NOT NULL,
    action       text NOT NULL,  -- 'approved','rejected','pending','submitted'
    actor_id     uuid REFERENCES auth.users(id),
    notes        text,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_events_decision ON approval_events(decision_id, created_at);
CREATE INDEX IF NOT EXISTS idx_approval_events_version ON approval_events(decision_id, version);

ALTER TABLE approval_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approval_events_select" ON approval_events
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "approval_events_insert" ON approval_events
    FOR INSERT TO authenticated WITH CHECK (true);

COMMENT ON TABLE approval_events IS 'Immutable log of every approval action. Each row records a single team decision at a specific version. Old events are never deleted or overwritten.';


-- =========================================================================
-- 2. ADD VERSION TO APPROVALS TABLE + BACKFILL
-- =========================================================================

ALTER TABLE approvals ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;

-- Backfill: set existing approvals to their decision's current version
UPDATE approvals a
SET version = d.version
FROM decisions d
WHERE a.decision_id = d.id
  AND a.version IS NULL;


-- =========================================================================
-- 3. TRIGGER: Log every approval change into approval_events
-- =========================================================================

CREATE OR REPLACE FUNCTION log_approval_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- On INSERT or UPDATE, log the new state
    INSERT INTO approval_events (decision_id, version, team, action, actor_id, notes)
    VALUES (
        NEW.decision_id,
        COALESCE(NEW.version, 1),
        NEW.team,
        NEW.status,
        NEW.approved_by,
        NEW.notes
    );
    RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_log_approval_event ON approvals;
CREATE TRIGGER trg_log_approval_event
    AFTER INSERT OR UPDATE ON approvals
    FOR EACH ROW
    EXECUTE FUNCTION log_approval_event();


-- =========================================================================
-- 4. FIX STATUS TRANSITION RULES IN COLUMN GUARD
-- =========================================================================
-- Key changes:
-- a) Allow submitted → rejected by Engineering or Procurement (not just Quality)
-- b) Allow rejected → submitted (for re-submission after correction by any role)
-- c) Keep under_review → approved/rejected restricted to Quality
-- d) Properly track procurement_decision and quality_decision in ownership

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
    IF v_is_service OR v_is_lead OR v_ai_bypass THEN
        RETURN NEW;
    END IF;

    IF v_team IS NULL THEN
        RAISE EXCEPTION 'user has no team assigned' USING errcode = '42501';
    END IF;

    -- AI columns are untouchable by regular users
    v_ai_changed :=
        NEW.ai_rating          IS DISTINCT FROM OLD.ai_rating          OR
        NEW.ai_reason          IS DISTINCT FROM OLD.ai_reason          OR
        NEW.ai_flags           IS DISTINCT FROM OLD.ai_flags           OR
        NEW.ai_last_checked_at IS DISTINCT FROM OLD.ai_last_checked_at;

    IF v_ai_changed THEN
        RAISE EXCEPTION 'AI-owned columns can only be written by the AI service'
            USING errcode = '42501';
    END IF;

    -- Field ownership detection
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
        NEW.procurement_notes    IS DISTINCT FROM OLD.procurement_notes    OR
        NEW.procurement_decision IS DISTINCT FROM OLD.procurement_decision;

    v_qual_changed :=
        NEW.quality_status       IS DISTINCT FROM OLD.quality_status       OR
        NEW.inspection_required  IS DISTINCT FROM OLD.inspection_required  OR
        NEW.inspection_result    IS DISTINCT FROM OLD.inspection_result    OR
        NEW.pass_fail            IS DISTINCT FROM OLD.pass_fail            OR
        NEW.defect_issue         IS DISTINCT FROM OLD.defect_issue         OR
        NEW.quality_notes        IS DISTINCT FROM OLD.quality_notes        OR
        NEW.quality_decision     IS DISTINCT FROM OLD.quality_decision;

    -- Enforce field ownership: each team can only edit their own fields
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

    -- === STATUS TRANSITION RULES (v2) ===
    -- Fixed: added submitted->rejected for Eng/Proc, rejected->submitted for resubmit
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF OLD.status = 'draft' AND NEW.status = 'submitted' THEN
            -- Only Design can submit a draft
            IF v_team <> 'design' THEN
                RAISE EXCEPTION 'only design can submit a draft' USING errcode = '42501';
            END IF;

        ELSIF OLD.status = 'submitted' AND NEW.status = 'under_review' THEN
            -- Any reviewing team (Eng, Proc) can move submitted -> under_review
            -- Quality cannot do this (they are the last gate)
            IF v_team = 'quality' THEN
                RAISE EXCEPTION 'quality cannot move submitted -> under_review'
                    USING errcode = '42501';
            END IF;

        ELSIF OLD.status = 'submitted' AND NEW.status = 'rejected' THEN
            -- Engineering or Procurement can reject directly from submitted
            IF v_team NOT IN ('engineering', 'procurement') THEN
                RAISE EXCEPTION 'only engineering or procurement can reject a submitted decision'
                    USING errcode = '42501';
            END IF;

        ELSIF OLD.status = 'under_review' AND NEW.status = 'approved' THEN
            -- Only Quality can give final approval
            IF v_team <> 'quality' THEN
                RAISE EXCEPTION 'only quality can give final approval'
                    USING errcode = '42501';
            END IF;

        ELSIF OLD.status = 'under_review' AND NEW.status = 'rejected' THEN
            -- Quality or Procurement can reject during under_review
            IF v_team NOT IN ('quality', 'procurement') THEN
                RAISE EXCEPTION 'only quality or procurement can reject during review'
                    USING errcode = '42501';
            END IF;

        ELSIF OLD.status = 'rejected' AND NEW.status = 'draft' THEN
            -- Only Design can reopen a rejected decision as draft
            IF v_team <> 'design' THEN
                RAISE EXCEPTION 'only design can reopen a rejected decision'
                    USING errcode = '42501';
            END IF;

        ELSIF OLD.status = 'rejected' AND NEW.status = 'submitted' THEN
            -- Any team can trigger a re-submission from rejected (after corrections)
            -- This allows the correction window workflow
            NULL;

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
-- 5. ENHANCED SNAPSHOT TRIGGER
-- =========================================================================
-- Also captures snapshots on version bumps, not just status changes.

CREATE OR REPLACE FUNCTION snapshot_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status OR OLD.version IS DISTINCT FROM NEW.version THEN
        INSERT INTO decision_snapshots (decision_id, version, status, snapshot, created_by)
        VALUES (
            NEW.id,
            NEW.version,
            NEW.status,
            to_jsonb(NEW),
            COALESCE(NEW.submitted_by, auth.uid())
        );
    END IF;
    RETURN NEW;
END;
$$;
