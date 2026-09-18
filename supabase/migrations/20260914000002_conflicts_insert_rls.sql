-- Migration: Add INSERT policy for conflicts table
-- The frontend now inserts conflict rows directly from the AI readiness check
-- instead of relying on the Edge Function (service_role). Authenticated users
-- need INSERT permission so the conflict sync works.

-- Allow any authenticated user to insert a conflict row.
-- The data is AI-generated and validated before insertion.
create policy conflicts_insert_authenticated
    on conflicts for insert
    to authenticated
    with check (true);
