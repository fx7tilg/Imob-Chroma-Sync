-- =========================================================================
-- Chroma Sync - Data Fix
-- Migration: Replace business area codes with full paths in existing decisions
--
-- This fixes the bug where existing decisions show "INT-IP" instead of
-- the full "Interior › Instrument Panel / Dashboard" string.
-- =========================================================================

set search_path = public, extensions;

-- Create a temporary mapping function or just update directly
do $$
declare
    rec record;
    full_path text;
    parent_name text;
begin
    for rec in (select code, name, parent_id from master_business_areas where parent_id is not null) loop
        -- Get parent name
        select name into parent_name from master_business_areas where id = rec.parent_id;
        full_path := parent_name || ' › ' || rec.name;
        
        -- Update existing decisions that still use the short code
        update decisions 
        set business_area = full_path 
        where business_area = rec.code;
    end loop;
    
    -- Also update any parent-level assignments just in case (EXT -> Exterior)
    for rec in (select code, name from master_business_areas where parent_id is null) loop
        update decisions 
        set business_area = rec.name 
        where business_area = rec.code;
    end loop;
end $$;

-- =========================================================================
-- Done!
-- =========================================================================
