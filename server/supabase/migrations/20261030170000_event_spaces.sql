-- Each event offers its own set of spaces. Existing events keep all four spaces.

alter table public.events
  add column if not exists spaces_available text[] not null
  default array['grass-generator', 'grass', 'food-truck', 'pavilion']::text[];

alter table public.events alter column spaces_available drop default;

alter table public.events drop constraint if exists events_spaces_available_check;
alter table public.events
  add constraint events_spaces_available_check
  check (
    cardinality(spaces_available) > 0
    and spaces_available <@ array['grass-generator', 'grass', 'food-truck', 'pavilion']::text[]
  );

create or replace function public.register_for_event(p_event_id uuid, p_user_id uuid, p_space_requested text)
returns public.registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_registration public.registrations;
  event_capacity integer;
  event_spaces text[];
  registration_count integer;
begin
  select capacity, spaces_available into event_capacity, event_spaces
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'event_not_found';
  end if;

  select * into existing_registration
  from public.registrations
  where event_id = p_event_id and user_id = p_user_id;

  if p_space_requested is null or p_space_requested not in ('grass-generator', 'grass', 'food-truck', 'pavilion') then
    raise exception 'invalid_space';
  end if;

  if found then
    return existing_registration;
  end if;

  if not (p_space_requested = any(event_spaces)) then
    raise exception 'space_unavailable';
  end if;

  if event_capacity is not null then
    select count(*) into registration_count
    from public.registrations
    where event_id = p_event_id;

    if registration_count >= event_capacity then
      raise exception 'event_full';
    end if;
  end if;

  insert into public.registrations (event_id, user_id, space_requested)
  values (p_event_id, p_user_id, p_space_requested)
  returning * into existing_registration;

  return existing_registration;
end;
$$;

revoke all on function public.register_for_event(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.register_for_event(uuid, uuid, text) to service_role;
