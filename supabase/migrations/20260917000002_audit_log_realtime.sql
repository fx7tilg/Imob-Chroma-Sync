-- Ensure audit_log streams via realtime so every role receives a live
-- notification whenever a decision (or other audited record) is created/updated.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'audit_log'
    ) then
      alter publication supabase_realtime add table public.audit_log;
    end if;
  end if;
end $$;
