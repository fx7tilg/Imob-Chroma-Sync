-- Migration: 20260918000000_feature_credits.sql
-- Description: Adds a daily credit system for integrated AI features. 
-- All roles get 3 credits per feature per day, except admins who have unlimited credits.

CREATE TABLE IF NOT EXISTS public.user_feature_credits (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    feature_key text NOT NULL,
    date_used date NOT NULL,
    credits_used integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (user_id, feature_key, date_used)
);

-- Enable RLS
ALTER TABLE public.user_feature_credits ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own credit usage
CREATE POLICY "Users can read own credit usage"
    ON public.user_feature_credits
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Admin override policy (optional, mostly handled by RPC)
CREATE POLICY "Admins can read all credit usage"
    ON public.user_feature_credits
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND is_project_lead = true
        )
    );

-- Create RPC to check and use a credit
CREATE OR REPLACE FUNCTION public.use_ai_credit(p_feature_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_is_lead boolean;
    v_today date;
    v_used int;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN 
        RETURN jsonb_build_object('allowed', false, 'remaining', 0);
    END IF;

    -- Check admin status
    SELECT is_project_lead INTO v_is_lead
    FROM public.profiles WHERE id = v_user_id;

    IF v_is_lead = true THEN
        RETURN jsonb_build_object('allowed', true, 'remaining', null);
    END IF;

    v_today := current_date;

    -- Get or create today's usage record
    INSERT INTO public.user_feature_credits (user_id, feature_key, date_used, credits_used)
    VALUES (v_user_id, p_feature_key, v_today, 0)
    ON CONFLICT (user_id, feature_key, date_used) DO NOTHING;

    -- Retrieve current usage
    SELECT credits_used INTO v_used
    FROM public.user_feature_credits
    WHERE user_id = v_user_id AND feature_key = p_feature_key AND date_used = v_today;

    -- Check limit (3 credits per feature per day)
    IF v_used >= 3 THEN
        RETURN jsonb_build_object('allowed', false, 'remaining', 0);
    END IF;

    -- Consume a credit
    UPDATE public.user_feature_credits
    SET credits_used = credits_used + 1, updated_at = now()
    WHERE user_id = v_user_id AND feature_key = p_feature_key AND date_used = v_today;

    RETURN jsonb_build_object('allowed', true, 'remaining', 3 - (v_used + 1));
END;
$$;
