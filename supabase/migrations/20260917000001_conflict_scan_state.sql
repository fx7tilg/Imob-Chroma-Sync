-- =========================================================================
-- conflict_scan_state - lets detect-conflicts skip the paid LLM call when
-- nothing changed in a business area since the last scan.
-- =========================================================================

create table if not exists conflict_scan_state (
    business_area   text primary key,
    last_scanned_at timestamptz not null default now()
);

alter table conflict_scan_state enable row level security;

-- Read-only to clients; only the service role (edge function) writes to it.
create policy "allow select on conflict_scan_state"
    on conflict_scan_state for select
    to authenticated
    using (true);
