-- Migration: decision_deep_analyses table
CREATE TABLE IF NOT EXISTS public.decision_deep_analyses (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    decision_id uuid NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
    decision_version integer NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES auth.users(id),
    snapshot_hash text NOT NULL,
    content jsonb,
    status text NOT NULL DEFAULT 'running',
    error_message text,
    CONSTRAINT decision_deep_analyses_pkey PRIMARY KEY (id)
);

-- Enable RLS
ALTER TABLE public.decision_deep_analyses ENABLE ROW LEVEL SECURITY;

-- Allow users to view all deep analyses
CREATE POLICY "Enable read access for all users" ON public.decision_deep_analyses
    FOR SELECT USING (true);

-- Allow authenticated users to insert a deep analysis
CREATE POLICY "Enable insert for authenticated users only" ON public.decision_deep_analyses
    FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Allow users to update their own deep analyses
CREATE POLICY "Enable update for creators" ON public.decision_deep_analyses
    FOR UPDATE USING (auth.uid() = created_by);

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.decision_deep_analyses;