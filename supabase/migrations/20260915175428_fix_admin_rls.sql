set search_path = public, extensions;

-- The previous policy required current_team() to not be null.
-- Project Leads (Admins) may not be assigned to a specific team.
-- We must allow project leads to update decisions in RLS.

DROP POLICY IF EXISTS decisions_update_team ON decisions;

CREATE POLICY decisions_update_team
    ON decisions FOR UPDATE
    TO authenticated
    USING (current_team() IS NOT NULL OR is_project_lead())
    WITH CHECK (current_team() IS NOT NULL OR is_project_lead());
