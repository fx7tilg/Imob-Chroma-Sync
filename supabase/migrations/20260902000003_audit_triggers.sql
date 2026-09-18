-- Chroma Sync - Phase 1
-- Migration 0003: audit triggers
--
-- Every insert/update/delete on decisions and approvals is written to
-- audit_log automatically. Application code never has to remember to log.

set search_path = public;

create or replace function audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_row_id uuid;
    v_old    jsonb;
    v_new    jsonb;
begin
    if tg_op = 'DELETE' then
        v_row_id := (old).id;
        v_old    := to_jsonb(old);
        v_new    := null;
    elsif tg_op = 'UPDATE' then
        v_row_id := (new).id;
        v_old    := to_jsonb(old);
        v_new    := to_jsonb(new);
    else
        v_row_id := (new).id;
        v_old    := null;
        v_new    := to_jsonb(new);
    end if;

    insert into public.audit_log (table_name, row_id, action, changed_by, old_values, new_values)
    values (tg_table_name, v_row_id, tg_op::audit_action_t, auth.uid(), v_old, v_new);

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

create trigger decisions_audit
    after insert or update or delete on decisions
    for each row
    execute function audit_row_change();

create trigger approvals_audit
    after insert or update or delete on approvals
    for each row
    execute function audit_row_change();
