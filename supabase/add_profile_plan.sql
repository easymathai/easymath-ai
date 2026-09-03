-- EasyMath AI — add trusted Free/Pro plan column to profiles
-- Run once in the Supabase SQL Editor on existing projects.
-- Safe for existing rows: defaults to 'free'. Does not reset progress/usage.

alter table public.profiles
  add column if not exists plan text;

update public.profiles
set plan = 'free'
where plan is null;

alter table public.profiles
  alter column plan set default 'free';

alter table public.profiles
  alter column plan set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_plan_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_plan_check
      check (plan in ('free', 'pro'));
  end if;
end $$;

-- Prevent authenticated end-users from self-upgrading via client UPDATE/INSERT.
-- Privileged SQL Editor / service_role updates can still set plan = 'pro'.
create or replace function public.protect_profile_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow trusted/admin paths (dashboard SQL, service role) to manage plan.
  if auth.uid() is null or auth.role() = 'service_role' then
    if tg_op = 'INSERT' and new.plan is null then
      new.plan := 'free';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Client inserts always start as Free.
    new.plan := 'free';
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Ignore any attempted plan change from the signed-in client.
    new.plan := old.plan;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_plan on public.profiles;
create trigger protect_profile_plan
  before insert or update on public.profiles
  for each row execute function public.protect_profile_plan();
