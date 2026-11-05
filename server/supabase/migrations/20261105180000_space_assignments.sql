-- Numbered spaces on the site map. Pavilion includes spot 13 from the template.

create table if not exists public.space_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  registration_id uuid not null references public.registrations (id) on delete cascade,
  area text not null check (area in ('pavilion', 'grass', 'food-truck')),
  spot integer not null,
  created_at timestamptz not null default now(),
  unique (event_id, area, spot),
  constraint space_assignments_spot_check check (
    (area = 'pavilion' and spot between 1 and 13)
    or (area = 'grass' and spot between 1 and 28)
    or (area = 'food-truck' and spot between 1 and 2)
  )
);

create index if not exists space_assignments_event_id_idx on public.space_assignments (event_id);
create index if not exists space_assignments_registration_id_idx on public.space_assignments (registration_id);

alter table public.space_assignments enable row level security;
revoke all on table public.space_assignments from anon, authenticated;
