alter table public.registrations add column if not exists space_requested text;

alter table public.registrations drop constraint if exists registrations_space_requested_check;
alter table public.registrations
  add constraint registrations_space_requested_check
  check (space_requested is null or space_requested in ('grass-generator', 'grass', 'food-truck', 'pavilion'));

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'space_requested'
  ) then
    update public.registrations as registration
    set space_requested = account.space_requested
    from public.users as account
    where registration.user_id = account.id
      and registration.space_requested is null
      and account.space_requested is not null;
  end if;
end $$;

alter table public.users drop constraint if exists users_space_requested_check;
alter table public.users drop column if exists space_requested;

drop function if exists public.register_for_event(uuid, uuid);

create or replace function public.register_for_event(p_event_id uuid, p_user_id uuid, p_space_requested text)
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

  if p_space_requested is null or p_space_requested not in ('grass-generator', 'grass', 'food-truck', 'pavilion') then
    raise exception 'invalid_space';
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

  insert into public.registrations (event_id, user_id, space_requested)
  values (p_event_id, p_user_id, p_space_requested)
  returning * into existing_registration;

  return existing_registration;
end;
$$;

revoke all on function public.register_for_event(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.register_for_event(uuid, uuid, text) to service_role;
