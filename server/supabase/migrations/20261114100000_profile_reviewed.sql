alter table public.users add column if not exists profile_reviewed_at timestamptz;

-- People who already finished a profile have reviewed it. New accounts stay blank until they save their own profile.
update public.users
set profile_reviewed_at = profile_completed_at
where profile_reviewed_at is null
  and profile_completed_at is not null;
