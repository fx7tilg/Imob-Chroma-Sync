-- Migration: risk_assessments table
CREATE TABLE IF NOT EXISTS public.risk_assessments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES auth.users(id),
    snapshot_hash text NOT NULL,
    decisions_snapshot jsonb NOT NULL,
    deterministic_signals jsonb NOT NULL,
    top_5_risks jsonb,
    executive_summary text,
    all_risks jsonb,
    cross_team_impact jsonb,
    status text NOT NULL DEFAULT 'running',
    error_message text,
    CONSTRAINT risk_assessments_pkey PRIMARY KEY (id)
);

-- Enable RLS
ALTER TABLE public.risk_assessments ENABLE ROW LEVEL SECURITY;

-- Allow users to view all risk assessments (or we could limit it, but for now allow authenticated users to view)
CREATE POLICY "Enable read access for all users" ON public.risk_assessments
    FOR SELECT USING (true);

-- Allow authenticated users to insert a risk assessment
CREATE POLICY "Enable insert for authenticated users only" ON public.risk_assessments
    FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Allow users to update their own risk assessments
CREATE POLICY "Enable update for creators" ON public.risk_assessments
    FOR UPDATE USING (auth.uid() = created_by);

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.risk_assessments;