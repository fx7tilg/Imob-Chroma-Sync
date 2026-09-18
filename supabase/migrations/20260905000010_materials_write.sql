-- Chroma Sync - Phase 1 MDM
-- Migration 0010: Materials Write Access
--
-- Adds write access to materials for project leads so it can be managed via Master Data Admin.

set search_path = public;

-- Write: only project leads
create policy "materials_all" on materials
    for all to authenticated using (is_project_lead());
