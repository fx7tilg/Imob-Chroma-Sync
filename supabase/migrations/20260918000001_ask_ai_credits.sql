-- Migration: 20260918000001_ask_ai_credits.sql
-- Description: Updates the use_ai_credit function to allow 5 daily credits specifically for the ask_ai feature, while keeping others at 3.

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
    v_limit int;
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

    -- Set dynamic limit based on feature
    IF p_feature_key = 'ask_ai' THEN
        v_limit := 5;
    ELSE
        v_limit := 3;
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

    -- Check limit
    IF v_used >= v_limit THEN
        RETURN jsonb_build_object('allowed', false, 'remaining', 0);
    END IF;

    -- Consume a credit
    UPDATE public.user_feature_credits
    SET credits_used = credits_used + 1, updated_at = now()
    WHERE user_id = v_user_id AND feature_key = p_feature_key AND date_used = v_today;

    RETURN jsonb_build_object('allowed', true, 'remaining', v_limit - (v_used + 1));
END;
$$;
