-- Migration: 20260912000003_ai_auto_reject.sql
-- Description: Updates set_ai_readiness to automatically reject red decisions.

set search_path = public, extensions;

create or replace function set_ai_readiness(
    p_decision_id       uuid,
    p_rating            ai_rating_t,
    p_reason            text,
    p_flags             jsonb,
    p_rc1_lifecycle     ai_rating_t,
    p_rc2_compliance    ai_rating_t,
    p_rc3_lead_time     ai_rating_t,
    p_rc4_visual        ai_rating_t,
    p_rc5_approval_rbac ai_rating_t,
    p_rc6_conflict      ai_rating_t,
    p_rc_flags          jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    perform set_config('app.ai_write', 'on', true);

    update decisions
       set ai_rating          = p_rating,
           ai_reason           = p_reason,
           ai_flags            = coalesce(p_flags, '[]'::jsonb),
           ai_last_checked_at  = now(),
           rc1_lifecycle       = p_rc1_lifecycle,
           rc2_compliance      = p_rc2_compliance,
           rc3_lead_time       = p_rc3_lead_time,
           rc4_visual          = p_rc4_visual,
           rc5_approval_rbac   = p_rc5_approval_rbac,
           rc6_conflict        = p_rc6_conflict,
           rc_flags            = coalesce(p_rc_flags, '{}'::jsonb),
           status              = CASE
                                   WHEN p_rating = 'red' AND status IN ('submitted', 'under_review') THEN 'rejected'::decision_status_t
                                   ELSE status
                                 END
     where id = p_decision_id;
end;
$$;
