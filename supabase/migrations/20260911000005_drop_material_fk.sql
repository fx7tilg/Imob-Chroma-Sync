-- =========================================================================
-- HOTFIX: Drop foreign key constraint on decisions.material_reference
-- 
-- The solution design requires us to demonstrate the "Orphan Material" 
-- integrity check (where a decision references a material code that does 
-- not exist in the materials table, e.g., 'MAT-9999'). 
-- Because material_reference was originally created with a strict FOREIGN KEY 
-- constraint, PostgreSQL prevents us from inserting this test data. 
-- Dropping this constraint allows our application-level integrity service 
-- to detect and flag these orphaned references organically.
-- =========================================================================

set search_path = public, extensions;

ALTER TABLE decisions 
  DROP CONSTRAINT IF EXISTS decisions_material_reference_fkey;
