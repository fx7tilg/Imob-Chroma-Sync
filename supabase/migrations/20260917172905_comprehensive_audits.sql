-- Migration: comprehensive_audits table
CREATE TABLE IF NOT EXISTS public.comprehensive_audits (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES auth.users(id),
    snapshot_hash text NOT NULL,
    content jsonb,
    status text NOT NULL DEFAULT 'running',
    error_message text,
    CONSTRAINT comprehensive_audits_pkey PRIMARY KEY (id)
);

-- Enable RLS
ALTER TABLE public.comprehensive_audits ENABLE ROW LEVEL SECURITY;

-- Allow users to view all comprehensive audits
CREATE POLICY "Enable read access for all users" ON public.comprehensive_audits
    FOR SELECT USING (true);

-- Allow authenticated users to insert a comprehensive audit
CREATE POLICY "Enable insert for authenticated users only" ON public.comprehensive_audits
    FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Allow users to update their own comprehensive audits
CREATE POLICY "Enable update for creators" ON public.comprehensive_audits
    FOR UPDATE USING (auth.uid() = created_by);

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.comprehensive_audits;