-- Create the enterprise_reports table
CREATE TABLE public.enterprise_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    report_type TEXT NOT NULL CHECK (report_type IN ('meldeliste', 'colour_mix', 'ai_readiness', 'supply_chain', 'compliance')),
    snapshot_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    content JSONB,
    error_message TEXT
);

-- Enable RLS
ALTER TABLE public.enterprise_reports ENABLE ROW LEVEL SECURITY;

-- Allow users to view all enterprise reports
CREATE POLICY "Enable read access for all users" ON public.enterprise_reports
    FOR SELECT USING (true);

-- Allow authenticated users to insert enterprise reports
CREATE POLICY "Enable insert for authenticated users only" ON public.enterprise_reports
    FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Allow users to update their own enterprise reports (for completing background jobs)
CREATE POLICY "Enable update for creators" ON public.enterprise_reports
    FOR UPDATE USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
