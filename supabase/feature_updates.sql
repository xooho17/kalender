-- Adds task completion, calendar deletion support, and email-based sharing.
-- Run this in the Supabase SQL editor for an existing Kalender project.

alter table public.events
  add column if not exists completed boolean not null default false;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles(lower(email));

alter table public.profiles enable row level security;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, email)
  values (new.id, lower(new.email))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists auth_users_profile on auth.users;
create trigger auth_users_profile
after insert or update of email on auth.users
for each row execute function public.handle_new_user_profile();

insert into public.profiles(id, email)
select id, lower(email)
from auth.users
where email is not null
on conflict (id) do update set email = excluded.email;

create or replace function public.share_calendar_by_email(
  target_calendar_id uuid,
  target_email text,
  target_role public.calendar_role
)
returns public.calendar_members
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  membership public.calendar_members;
begin
  if target_role = 'owner' then
    raise exception 'Cannot grant owner role through sharing';
  end if;

  if not public.is_calendar_owner(target_calendar_id) then
    raise exception 'Only calendar owners can share calendars';
  end if;

  select p.id into target_user_id
  from public.profiles p
  where p.email = lower(trim(target_email));

  if target_user_id is null then
    raise exception 'No user found for email %', target_email;
  end if;

  insert into public.calendar_members(calendar_id, user_id, role)
  values (target_calendar_id, target_user_id, target_role)
  on conflict (calendar_id, user_id) do update set role = excluded.role
  returning * into membership;

  return membership;
end;
$$;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());
