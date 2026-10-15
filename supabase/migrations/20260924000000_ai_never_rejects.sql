-- Only a human approver can reject a decision.
--
-- Migration 20260912000003 made set_ai_readiness flip a submitted or
-- under_review decision to 'rejected' whenever the AI rating was red. That
-- let an automated check take a workflow decision that belongs to the team
-- approvers, and it bypassed the approval trail: no approvals row was marked
-- rejected and no rejection note was recorded.
--
-- The AI now only writes its assessment. A red rating is shown to the
-- approvers as a blocker; rejecting stays an explicit action in the approval
-- panel, which requires a note (approvals_guard) and is audited.

set search_path = public;

create or replace function set_ai_readiness(
    p_decision_id uuid,
    p_rating ai_rating_t,
    p_reason text,
    p_flags jsonb,
    p_rc1_lifecycle ai_rating_t,
    p_rc2_compliance ai_rating_t,
    p_rc3_lead_time ai_rating_t,
    p_rc4_visual ai_rating_t,
    p_rc5_approval_rbac ai_rating_t,
    p_rc6_conflict ai_rating_t,
    p_rc_flags jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_status decision_status_t;
begin
    select status into v_status from decisions where id = p_decision_id;
    if v_status is null then
        raise exception 'decision not found' using errcode = 'P0002';
    end if;

    if auth.uid() is not null and v_status in ('approved', 'rejected') then
        raise exception 'AI readiness cannot be rewritten on a % decision', v_status
            using errcode = '42501';
    end if;

    perform set_config('app.ai_write', 'on', true);

    update decisions
       set ai_rating          = p_rating,
           ai_reason          = p_reason,
           ai_flags           = coalesce(p_flags, '[]'::jsonb),
           ai_last_checked_at = now(),
           rc1_lifecycle      = p_rc1_lifecycle,
           rc2_compliance     = p_rc2_compliance,
           rc3_lead_time      = p_rc3_lead_time,
           rc4_visual         = p_rc4_visual,
           rc5_approval_rbac  = p_rc5_approval_rbac,
           rc6_conflict       = p_rc6_conflict,
           rc_flags           = coalesce(p_rc_flags, '{}'::jsonb)
     where id = p_decision_id;
end;
$$;

revoke execute on function set_ai_readiness(
    uuid, ai_rating_t, text, jsonb, ai_rating_t, ai_rating_t,
    ai_rating_t, ai_rating_t, ai_rating_t, ai_rating_t, jsonb
) from anon, public;
grant execute on function set_ai_readiness(
    uuid, ai_rating_t, text, jsonb, ai_rating_t, ai_rating_t,
    ai_rating_t, ai_rating_t, ai_rating_t, ai_rating_t, jsonb
) to authenticated;
