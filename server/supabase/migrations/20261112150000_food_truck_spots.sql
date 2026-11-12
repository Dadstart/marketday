alter table public.space_assignments drop constraint if exists space_assignments_spot_check;

alter table public.space_assignments add constraint space_assignments_spot_check check (
  (area = 'pavilion' and spot between 1 and 13)
  or (area = 'grass' and spot between 1 and 28)
  or (area = 'food-truck' and spot between 1 and 4)
);
