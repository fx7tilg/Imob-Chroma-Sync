-- Chroma Sync - Phase 5
-- Migration 0006: auto-create a profile row on self-serve signup.
--
-- Reads full_name / team / is_project_lead from auth.users.raw_user_meta_data,
-- set by the frontend Signup page via supabase.auth.signUp({ options: { data } }).

set search_path = public;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_team text := new.raw_user_meta_data ->> 'team';
begin
    insert into public.profiles (id, full_name, team, is_project_lead)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
        nullif(v_team, '')::team_t,
        coalesce((new.raw_user_meta_data ->> 'is_project_lead')::boolean, false)
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row
    execute function handle_new_user();
