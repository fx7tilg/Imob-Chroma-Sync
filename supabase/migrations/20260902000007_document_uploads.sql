-- Chroma Sync - Phase 1.5
-- Migration 0007: document uploads and reference_documents array
--
-- Adds support for multi-document uploads for decisions.

set search_path = public, extensions;

-- 1. Add reference_documents to decisions
alter table decisions add column reference_documents jsonb not null default '[]'::jsonb;

-- 2. Create the Storage bucket
insert into storage.buckets (id, name, public)
values ('decision_documents', 'decision_documents', true)
on conflict (id) do nothing;

-- 3. Storage RLS Policies
-- Allow anyone logged in to upload files
create policy "Allow authenticated uploads"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'decision_documents' );

-- Allow anyone to read files from this bucket (since the bucket is public, this is optional but good practice)
create policy "Allow public read"
on storage.objects for select
using ( bucket_id = 'decision_documents' );

-- Allow authenticated users to update/delete (e.g. if they make a mistake)
create policy "Allow authenticated update"
on storage.objects for update
to authenticated
using ( bucket_id = 'decision_documents' );

create policy "Allow authenticated delete"
on storage.objects for delete
to authenticated
using ( bucket_id = 'decision_documents' );
