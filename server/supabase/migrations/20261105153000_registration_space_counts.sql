-- Allow more than one of the same space on a registration, such as two 10x10 grass spots.

create or replace function public.register_for_event(p_event_id uuid, p_user_id uuid, p_spaces_requested text[])
returns public.registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_registration public.registrations;
  already_registered boolean;
  event_capacity integer;
  event_spaces text[];
  registration_count integer;
  requested text[] := array[]::text[];
  space text;
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
  already_registered := found;

  if p_spaces_requested is null or cardinality(p_spaces_requested) = 0 then
    raise exception 'invalid_space';
  end if;

  foreach space in array p_spaces_requested loop
    if space is null or space not in ('grass-generator', 'grass', 'food-truck', 'pavilion') then
      raise exception 'invalid_space';
    end if;
    if not (space = any(event_spaces)) then
      raise exception 'space_unavailable';
    end if;
    requested := requested || space;
  end loop;

  if cardinality(requested) > 20 then
    raise exception 'too_many_spaces';
  end if;

  if already_registered then
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

  insert into public.registrations (event_id, user_id, spaces_requested)
  values (p_event_id, p_user_id, requested)
  returning * into existing_registration;

  return existing_registration;
end;
$$;

revoke all on function public.register_for_event(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.register_for_event(uuid, uuid, text[]) to service_role;
