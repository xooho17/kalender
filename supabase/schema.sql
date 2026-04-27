-- Kalender Supabase schema and Row Level Security policies.
-- Run this in the Supabase SQL editor after enabling Email/Password Auth.

create extension if not exists pgcrypto;

do $$
begin
  create type public.calendar_role as enum ('owner', 'collaborator', 'viewer');
exception
  when duplicate_object then null;
end;
$$;

create table public.calendars (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text not null default '#92c5fc',
  created_at timestamptz not null default now()
);

create table public.calendar_members (
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.calendar_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (calendar_id, user_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  color text not null default '#92c5fc',
  category text not null default 'work',
  reminder_minutes integer,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (category in ('work', 'personal', 'urgent', 'focus', 'travel')),
  check (reminder_minutes is null or reminder_minutes in (5, 10, 15, 30, 60, 1440))
);

create index calendars_owner_id_idx on public.calendars(owner_id);
create index calendar_members_user_id_idx on public.calendar_members(user_id);
create index events_calendar_time_idx on public.events(calendar_id, starts_at, ends_at);

alter table public.calendars enable row level security;
alter table public.calendar_members enable row level security;
alter table public.events enable row level security;

create or replace function public.is_calendar_member(target_calendar_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.calendar_members cm
    where cm.calendar_id = target_calendar_id
      and cm.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_calendar(target_calendar_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.calendar_members cm
    where cm.calendar_id = target_calendar_id
      and cm.user_id = auth.uid()
      and cm.role in ('owner', 'collaborator')
  );
$$;

create or replace function public.is_calendar_owner(target_calendar_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.calendar_members cm
    where cm.calendar_id = target_calendar_id
      and cm.user_id = auth.uid()
      and cm.role = 'owner'
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create or replace function public.add_calendar_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.calendar_members(calendar_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (calendar_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

create trigger events_touch_updated_at
before update on public.events
for each row execute function public.touch_updated_at();

create trigger calendars_add_owner_member
after insert on public.calendars
for each row execute function public.add_calendar_owner_member();

create policy "Members can read calendars"
on public.calendars
for select
using (public.is_calendar_member(id));

create policy "Authenticated users can create owned calendars"
on public.calendars
for insert
with check (auth.uid() = owner_id);

create policy "Owners can update calendars"
on public.calendars
for update
using (public.is_calendar_owner(id))
with check (public.is_calendar_owner(id));

create policy "Owners can delete calendars"
on public.calendars
for delete
using (public.is_calendar_owner(id));

create policy "Users can read their memberships"
on public.calendar_members
for select
using (user_id = auth.uid() or public.is_calendar_owner(calendar_id));

create policy "Owners can share calendars"
on public.calendar_members
for insert
with check (public.is_calendar_owner(calendar_id));

create policy "Owners can update memberships"
on public.calendar_members
for update
using (public.is_calendar_owner(calendar_id))
with check (public.is_calendar_owner(calendar_id));

create policy "Owners can remove memberships"
on public.calendar_members
for delete
using (public.is_calendar_owner(calendar_id));

create policy "Members can read events"
on public.events
for select
using (public.is_calendar_member(calendar_id));

create policy "Editors can create events"
on public.events
for insert
with check (public.can_edit_calendar(calendar_id));

create policy "Editors can update events"
on public.events
for update
using (public.can_edit_calendar(calendar_id))
with check (public.can_edit_calendar(calendar_id));

create policy "Editors can delete events"
on public.events
for delete
using (public.can_edit_calendar(calendar_id));

do $$
begin
  alter publication supabase_realtime add table public.events;
exception
  when duplicate_object then null;
end;
$$;
