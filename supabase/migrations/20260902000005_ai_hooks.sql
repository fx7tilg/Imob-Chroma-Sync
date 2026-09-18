-- Chroma Sync - Phase 4
-- Migration 0005: hook Postgres → Edge Functions via pg_net.
--
-- On decisions.status transition to 'submitted', asynchronously invoke
-- the 'on-decision-submitted' Edge Function. Schedule the conflict
-- detector every 30 minutes via pg_cron.
--
-- Configuration (set with `alter database ... set app.xxx = ...`):
--   app.supabase_functions_url   e.g. http://kong:8000/functions/v1
--   app.service_role_key         Supabase service_role JWT

create extension if not exists pg_net;
create extension if not exists pg_cron;

set search_path = public;

create or replace function notify_decision_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_url  text := current_setting('app.supabase_functions_url', true);
    v_key  text := current_setting('app.service_role_key', true);
begin
    if v_url is null or v_key is null then
        -- Config not set (e.g. during migrations without runtime). Skip silently.
        return new;
    end if;

    if (tg_op = 'INSERT' and new.status = 'submitted')
       or (tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'submitted')
    then
        perform net.http_post(
            url := v_url || '/on-decision-submitted',
            headers := jsonb_build_object(
                'content-type', 'application/json',
                'authorization', 'Bearer ' || v_key
            ),
            body := jsonb_build_object('decision_id', new.id)
        );
    end if;
    return new;
end;
$$;

create trigger decisions_notify_submitted
    after insert or update of status on decisions
    for each row
    execute function notify_decision_submitted();

-- Scheduled conflict detection every 30 minutes.
select cron.schedule(
    'chroma-detect-conflicts',
    '*/30 * * * *',
    $$
    select net.http_post(
        url := current_setting('app.supabase_functions_url', true) || '/detect-conflicts',
        headers := jsonb_build_object(
            'content-type', 'application/json',
            'authorization', 'Bearer ' || current_setting('app.service_role_key', true)
        ),
        body := '{}'::jsonb
    );
    $$
);
