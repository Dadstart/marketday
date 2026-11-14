create table if not exists public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  subject text not null,
  vendor_name text not null,
  email text not null,
  status text not null check (status in ('sent', 'failed')),
  result text not null,
  created_at timestamptz not null default now()
);

create index if not exists email_deliveries_event_id_idx on public.email_deliveries (event_id, created_at);

alter table public.email_deliveries enable row level security;

revoke all on table public.email_deliveries from anon, authenticated;
