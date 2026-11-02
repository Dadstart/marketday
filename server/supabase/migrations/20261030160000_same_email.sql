-- One email address is one user, whether they sign in with Google or Microsoft.
-- Existing duplicate accounts are combined. The kept account is the one with a
-- completed profile, otherwise the oldest account.

update public.users
set email = lower(btrim(email))
where email <> lower(btrim(email));

do $$
declare
  email_key text;
  survivor_id uuid;
  duplicate_id uuid;
begin
  for email_key in
    select lower(email)
    from public.users
    group by lower(email)
    having count(*) > 1
  loop
    select id into survivor_id
    from public.users
    where lower(email) = email_key
    order by (profile_completed_at is not null) desc, created_at asc, id asc
    limit 1;

    for duplicate_id in
      select id
      from public.users
      where lower(email) = email_key
        and id <> survivor_id
    loop
      update public.users as survivor
      set
        picture = coalesce(survivor.picture, duplicate.picture),
        venmo = coalesce(survivor.venmo, duplicate.venmo),
        contact_person = coalesce(survivor.contact_person, duplicate.contact_person),
        business_name = coalesce(survivor.business_name, duplicate.business_name),
        phone = coalesce(survivor.phone, duplicate.phone),
        crosswinds_resident = coalesce(survivor.crosswinds_resident, duplicate.crosswinds_resident),
        offering = coalesce(survivor.offering, duplicate.offering),
        products_and_services = coalesce(survivor.products_and_services, duplicate.products_and_services),
        facebook_name = coalesce(survivor.facebook_name, duplicate.facebook_name),
        profile_completed_at = coalesce(survivor.profile_completed_at, duplicate.profile_completed_at)
      from public.users as duplicate
      where survivor.id = survivor_id
        and duplicate.id = duplicate_id;

      update public.registrations as survivor_registration
      set space_requested = coalesce(survivor_registration.space_requested, duplicate_registration.space_requested)
      from public.registrations as duplicate_registration
      where survivor_registration.user_id = survivor_id
        and duplicate_registration.user_id = duplicate_id
        and survivor_registration.event_id = duplicate_registration.event_id;

      update public.registrations as survivor_registration
      set
        paid_at = duplicate_registration.paid_at,
        amount_cents = duplicate_registration.amount_cents,
        stripe_checkout_session_id = duplicate_registration.stripe_checkout_session_id
      from public.registrations as duplicate_registration
      where survivor_registration.user_id = survivor_id
        and duplicate_registration.user_id = duplicate_id
        and survivor_registration.event_id = duplicate_registration.event_id
        and survivor_registration.paid_at is null
        and duplicate_registration.paid_at is not null;

      delete from public.registrations as duplicate_registration
      using public.registrations as survivor_registration
      where duplicate_registration.user_id = duplicate_id
        and survivor_registration.user_id = survivor_id
        and duplicate_registration.event_id = survivor_registration.event_id;

      update public.registrations
      set user_id = survivor_id
      where user_id = duplicate_id;

      update public.events
      set created_by = survivor_id
      where created_by = duplicate_id;

      delete from public.users where id = duplicate_id;
    end loop;
  end loop;
end $$;

create unique index if not exists users_email_lower_idx on public.users (lower(email));
