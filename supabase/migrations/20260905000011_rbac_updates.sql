-- Chroma Sync - Phase 1 RBAC
-- Migration 0011: RBAC Updates and Custom Audit Logs
--
-- Extends the audit log to support custom manual actions (DOWNLOAD, ROLE_CHANGE)
-- and updates RLS to allow project leads to edit users and insert custom audit logs.

set search_path = public;

-- 1. Extend audit_action_t
ALTER TYPE audit_action_t ADD VALUE IF NOT EXISTS 'DOWNLOAD';
ALTER TYPE audit_action_t ADD VALUE IF NOT EXISTS 'ROLE_CHANGE';

-- 2. Allow Project Leads to update profiles
-- Note: users can already update themselves via profiles_update_self
create policy "profiles_update_admin" on profiles
    for update to authenticated using (is_project_lead());

-- 3. Allow manual inserts into the audit_log
create policy "audit_log_insert_all" on audit_log
    for insert to authenticated with check (true);
