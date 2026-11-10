alter table public.users add column if not exists email_opt_out boolean not null default false;
