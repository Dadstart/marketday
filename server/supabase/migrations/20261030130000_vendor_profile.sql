-- Vendor details collected the first time a person signs in.
-- Safe to run after 20261030120000_init.sql.

alter table public.users add column if not exists venmo text;
alter table public.users add column if not exists contact_person text;
alter table public.users add column if not exists business_name text;
alter table public.users add column if not exists phone text;
alter table public.users add column if not exists crosswinds_resident boolean;
alter table public.users add column if not exists space_requested text;
alter table public.users add column if not exists offering text;
alter table public.users add column if not exists products_and_services text;
alter table public.users add column if not exists facebook_name text;
alter table public.users add column if not exists profile_completed_at timestamptz;

alter table public.users drop constraint if exists users_space_requested_check;
alter table public.users
  add constraint users_space_requested_check
  check (space_requested is null or space_requested in ('grass-generator', 'grass', 'food-truck', 'pavilion'));

alter table public.users drop constraint if exists users_offering_check;
alter table public.users
  add constraint users_offering_check
  check (offering is null or offering in ('retail', 'food', 'service', 'group', 'entertainment'));
