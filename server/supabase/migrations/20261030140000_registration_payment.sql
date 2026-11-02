alter table public.registrations add column if not exists paid_at timestamptz;
alter table public.registrations add column if not exists amount_cents integer;
alter table public.registrations add column if not exists stripe_checkout_session_id text;

alter table public.registrations drop constraint if exists registrations_amount_cents_check;
alter table public.registrations
  add constraint registrations_amount_cents_check
  check (amount_cents is null or amount_cents in (500, 1000));
