-- Chroma Sync - team invitations
--
-- A project lead invites someone by email with a chosen role. The invitee opens
-- the invite link, creates an account, and is placed in the invited team/role
-- automatically. Replaces the hardcoded demo rows in Settings > Team & Roles.
--
-- Trust model: the invite TOKEN is the credential. handle_new_user() only
-- applies an invitation when the token AND the signup email both match a
-- pending, unexpired row, so knowing someone's email alone grants nothing and
-- a self-service signup still cannot make itself a project lead.

set search_path = public;

create table if not exists team_invitations (
    id              uuid primary key default gen_random_uuid(),
    email           text not null check (email = lower(email) and position('@' in email) > 1),
    team            team_t,
    role            profile_role_t not null default 'viewer',
    is_project_lead boolean not null default false,
    token           text not null unique
                    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    status          text not null default 'pending'
                    check (status in ('pending', 'accepted', 'revoked')),
    invited_by      uuid references auth.users (id) on delete set null,
    created_at      timestamptz not null default now(),
    expires_at      timestamptz not null default now() + interval '7 days',
    accepted_at     timestamptz,
    accepted_by     uuid references auth.users (id) on delete set null,
    -- A non-lead invite must name a team; a lead invite must not.
    check ((is_project_lead and team is null) or (not is_project_lead and team is not null))
);

-- One live invitation per address.
create unique index if not exists team_invitations_pending_email_idx
    on team_invitations (email) where status = 'pending';

alter table team_invitations enable row level security;

drop policy if exists team_invitations_lead_all on team_invitations;
create policy team_invitations_lead_all on team_invitations
    for all to authenticated
    using (coalesce(is_project_lead(), false))
    with check (coalesce(is_project_lead(), false));

-- ---------------------------------------------------------------------------
-- Create / resend (lead only)
-- ---------------------------------------------------------------------------

create or replace function create_invitation(
    p_email text,
    p_team  team_t,
    p_role  profile_role_t,
    p_is_lead boolean default false
)
returns team_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email text := lower(btrim(coalesce(p_email, '')));
    v_row   team_invitations;
begin
    if not coalesce(is_project_lead(), false) then
        raise exception 'Only a project lead can invite members' using errcode = '42501';
    end if;

    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'Enter a valid email address' using errcode = '22023';
    end if;

    if exists (select 1 from auth.users where lower(email) = v_email) then
        raise exception '% already has an account', v_email using errcode = '23505';
    end if;

    -- An expired invite must not block re-inviting the same person.
    update team_invitations
       set status = 'revoked'
     where email = v_email and status = 'pending' and expires_at <= now();

    if p_is_lead then
        p_team := null;
    elsif p_team is null then
        raise exception 'Choose a team for this member' using errcode = '22023';
    end if;

    begin
        insert into team_invitations (email, team, role, is_project_lead, invited_by)
        values (v_email, p_team, coalesce(p_role, 'viewer'), coalesce(p_is_lead, false), auth.uid())
        returning * into v_row;
    exception when unique_violation then
        raise exception '% already has a pending invitation', v_email using errcode = '23505';
    end;

    return v_row;
end;
$$;

-- Issues a fresh token and a fresh 7-day window, which also revives an expired
-- invitation. The previous link stops working.
create or replace function resend_invitation(p_id uuid)
returns team_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
    v_row team_invitations;
begin
    if not coalesce(is_project_lead(), false) then
        raise exception 'Only a project lead can resend invitations' using errcode = '42501';
    end if;

    update team_invitations
       set token      = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
           expires_at = now() + interval '7 days',
           created_at = now()
     where id = p_id and status = 'pending'
    returning * into v_row;

    if not found then
        raise exception 'Invitation is no longer pending' using errcode = '22023';
    end if;
    return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public lookup used by the signup page to show what the link grants
-- ---------------------------------------------------------------------------

create or replace function invitation_for_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select jsonb_build_object(
               'email', i.email,
               'team', i.team,
               'role', i.role,
               'is_project_lead', i.is_project_lead,
               'expires_at', i.expires_at
           )
      from team_invitations i
     where i.token = p_token
       and i.status = 'pending'
       and i.expires_at > now();
$$;

-- ---------------------------------------------------------------------------
-- Signup applies a matching invitation
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_team      text := new.raw_user_meta_data ->> 'team';
    v_team_t    team_t;
    v_token     text := nullif(new.raw_user_meta_data ->> 'invite_token', '');
    v_invite    team_invitations;
    v_role      profile_role_t := 'editor';
    v_is_lead   boolean := false;
begin
    -- Unknown team strings must not abort the signup transaction.
    begin
        v_team_t := nullif(v_team, '')::team_t;
    exception when others then
        v_team_t := null;
    end;

    if v_token is not null then
        select * into v_invite
          from team_invitations
         where token = v_token
           and email = lower(new.email)
           and status = 'pending'
           and expires_at > now()
         for update;

        if found then
            v_team_t  := v_invite.team;
            v_role    := v_invite.role;
            v_is_lead := v_invite.is_project_lead;

            update team_invitations
               set status = 'accepted', accepted_at = now(), accepted_by = new.id
             where id = v_invite.id;
        end if;
    end if;

    insert into public.profiles (id, email, full_name, team, role, is_project_lead)
    values (
        new.id,
        new.email,
        coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email),
        v_team_t,
        v_role,
        v_is_lead
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function create_invitation(text, team_t, profile_role_t, boolean) from anon, public;
revoke execute on function resend_invitation(uuid) from anon, public;
grant execute on function create_invitation(text, team_t, profile_role_t, boolean) to authenticated;
grant execute on function resend_invitation(uuid) to authenticated;

-- The signup page runs before the visitor has a session.
revoke execute on function invitation_for_token(text) from public;
grant execute on function invitation_for_token(text) to anon, authenticated;
