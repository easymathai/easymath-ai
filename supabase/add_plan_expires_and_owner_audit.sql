-- EasyMath AI — Pro expiry + owner plan audit
-- Safe to run on existing projects. Does not change existing plan values.
-- Clients still cannot set plan or plan_expires_at (protect_profile_plan).

alter table public.profiles
  add column if not exists plan_expires_at timestamptz;

create or replace function public.protect_profile_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.role() = 'service_role' then
    if tg_op = 'INSERT' and new.plan is null then
      new.plan := 'free';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.plan := 'free';
    new.plan_expires_at := null;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.plan := old.plan;
    new.plan_expires_at := old.plan_expires_at;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_plan on public.profiles;
create trigger protect_profile_plan
  before insert or update on public.profiles
  for each row execute function public.protect_profile_plan();

create table if not exists public.owner_plan_audit (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  target_user_id uuid references auth.users (id) on delete set null,
  target_email text not null,
  from_plan text not null,
  to_plan text not null,
  from_plan_expires_at timestamptz,
  to_plan_expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.owner_plan_audit enable row level security;

revoke all on table public.owner_plan_audit from anon, authenticated, public;
grant all on table public.owner_plan_audit to service_role;
