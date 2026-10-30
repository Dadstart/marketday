-- Market Day: users, events, and registrations.
-- Run this in the Supabase SQL editor for https://fiwpwhgcyhaujunmcdxw.supabase.co.
-- The API uses the service role key. Browser and anon keys have no table access.

create table public.users (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('google', 'microsoft')),
  provider_subject text not null,
  email text not null,
  name text not null,
  picture text,
  venmo text,
  contact_person text,
  business_name text,
  phone text,
  crosswinds_resident boolean,
  space_requested text check (
    space_requested is null or space_requested in ('grass-generator', 'grass', 'food-truck', 'pavilion')
  ),
  offering text check (
    offering is null or offering in ('retail', 'food', 'service', 'group', 'entertainment')
  ),
  products_and_services text,
  facebook_name text,
  profile_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subject)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  location text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  capacity integer check (capacity is null or capacity > 0),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_created_by_fkey foreign key (created_by) references public.users (id)
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index events_starts_at_idx on public.events (starts_at);
create index registrations_event_id_idx on public.registrations (event_id);
create index registrations_user_id_idx on public.registrations (user_id);

alter table public.users enable row level security;
alter table public.events enable row level security;
alter table public.registrations enable row level security;

revoke all on table public.users from anon, authenticated;
revoke all on table public.events from anon, authenticated;
revoke all on table public.registrations from anon, authenticated;

-- Serializes signups for one event so capacity cannot be exceeded by simultaneous requests.
create or replace function public.register_for_event(p_event_id uuid, p_user_id uuid)
returns public.registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_registration public.registrations;
  event_capacity integer;
  registration_count integer;
begin
  select capacity into event_capacity
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'event_not_found';
  end if;

  select * into existing_registration
  from public.registrations
  where event_id = p_event_id and user_id = p_user_id;

  if found then
    return existing_registration;
  end if;

  if event_capacity is not null then
    select count(*) into registration_count
    from public.registrations
    where event_id = p_event_id;

    if registration_count >= event_capacity then
      raise exception 'event_full';
    end if;
  end if;

  insert into public.registrations (event_id, user_id)
  values (p_event_id, p_user_id)
  returning * into existing_registration;

  return existing_registration;
end;
$$;

revoke all on function public.register_for_event(uuid, uuid) from public, anon, authenticated;
grant execute on function public.register_for_event(uuid, uuid) to service_role;
