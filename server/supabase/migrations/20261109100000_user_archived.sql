alter table public.users add column if not exists archived boolean not null default false;
