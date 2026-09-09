-- EasyMath AI — STAGE A (compatibility)
-- Signed-in Free-plan solver reservations.
-- Run once in the Supabase SQL Editor on existing projects.
-- Do NOT run from the app.
--
-- Does NOT change guest usage RPCs, profiles.plan, or RLS on other tables.
--
-- After this file:
--   1. Deploy the new Next.js app (reservation_id claim/commit/release).
--   2. Run supabase/drop_legacy_solver_release.sql (STAGE B) to drop the
--      temporary zero-argument release_solver_usage().

-- ---------------------------------------------------------------------------
-- 1) Reservations (one row per claimed Free-plan credit)
-- ---------------------------------------------------------------------------
create table if not exists public.solver_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'released', 'committed')),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.solver_reservations enable row level security;

revoke all on table public.solver_reservations from public;
revoke all on table public.solver_reservations from anon;
revoke all on table public.solver_reservations from authenticated;

-- ---------------------------------------------------------------------------
-- 2) Claim: increment usage + insert pending reservation (one transaction)
-- ---------------------------------------------------------------------------
create or replace function public.claim_solver_usage()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  d date := (timezone('utc', now()))::date;
  current_count integer := 0;
  max_count integer := 10;
  reservation_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.daily_usage (user_id, usage_date, solver_count)
  values (uid, d, 0)
  on conflict (user_id, usage_date) do nothing;

  select solver_count into current_count
  from public.daily_usage
  where user_id = uid and usage_date = d
  for update;

  if current_count >= max_count then
    return json_build_object(
      'allowed', false,
      'used', current_count,
      'limit', max_count,
      'usage_date', d
    );
  end if;

  update public.daily_usage
  set solver_count = current_count + 1
  where user_id = uid and usage_date = d;

  insert into public.solver_reservations (user_id, usage_date, status)
  values (uid, d, 'pending')
  returning id into reservation_id;

  return json_build_object(
    'allowed', true,
    'used', current_count + 1,
    'limit', max_count,
    'usage_date', d,
    'reservation_id', reservation_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Release by reservation id: pending → released, decrement once
-- ---------------------------------------------------------------------------
create or replace function public.release_solver_usage(p_reservation_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  d date := (timezone('utc', now()))::date;
  current_count integer := 0;
  max_count integer := 10;
  released_id uuid;
  reservation_date date;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_reservation_id is not null then
    update public.solver_reservations
    set status = 'released'
    where id = p_reservation_id
      and user_id = uid
      and status = 'pending'
    returning id, usage_date into released_id, reservation_date;
  end if;

  if released_id is not null then
    select coalesce(solver_count, 0) into current_count
    from public.daily_usage
    where user_id = uid and usage_date = reservation_date
    for update;

    if current_count is null then
      current_count := 0;
    end if;

    if current_count > 0 then
      update public.daily_usage
      set solver_count = current_count - 1
      where user_id = uid and usage_date = reservation_date;
    end if;
  end if;

  select coalesce(solver_count, 0) into current_count
  from public.daily_usage
  where user_id = uid and usage_date = d;

  return json_build_object(
    'allowed', coalesce(current_count, 0) < max_count,
    'used', coalesce(current_count, 0),
    'limit', max_count,
    'usage_date', d
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Commit: pending → committed, never decrement (idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.commit_solver_usage(p_reservation_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  d date := (timezone('utc', now()))::date;
  current_count integer := 0;
  max_count integer := 10;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_reservation_id is not null then
    update public.solver_reservations
    set status = 'committed'
    where id = p_reservation_id
      and user_id = uid
      and status = 'pending';
  end if;

  select coalesce(solver_count, 0) into current_count
  from public.daily_usage
  where user_id = uid and usage_date = d;

  return json_build_object(
    'allowed', coalesce(current_count, 0) < max_count,
    'used', coalesce(current_count, 0),
    'limit', max_count,
    'usage_date', d
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) TEMPORARY / LEGACY COMPATIBILITY — zero-argument release_solver_usage()
--
-- The currently deployed old app calls rpc("release_solver_usage") with no
-- arguments after a failed solve. Keep this overload until that app is
-- replaced, then immediately run supabase/drop_legacy_solver_release.sql.
--
-- This is NOT a naked decrement. It may refund only by transitioning one
-- owned pending reservation to released. If none exists, it does nothing.
-- ---------------------------------------------------------------------------
create or replace function public.release_solver_usage()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  d date := (timezone('utc', now()))::date;
  current_count integer := 0;
  max_count integer := 10;
  pending_id uuid;
  released_id uuid;
  reservation_date date;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select id
  into pending_id
  from public.solver_reservations
  where user_id = uid
    and status = 'pending'
  order by created_at desc, id desc
  limit 1
  for update skip locked;

  if pending_id is not null then
    update public.solver_reservations
    set status = 'released'
    where id = pending_id
      and user_id = uid
      and status = 'pending'
    returning id, usage_date into released_id, reservation_date;
  end if;

  if released_id is not null then
    select coalesce(solver_count, 0) into current_count
    from public.daily_usage
    where user_id = uid and usage_date = reservation_date
    for update;

    if current_count is null then
      current_count := 0;
    end if;

    if current_count > 0 then
      update public.daily_usage
      set solver_count = current_count - 1
      where user_id = uid and usage_date = reservation_date;
    end if;
  end if;

  select coalesce(solver_count, 0) into current_count
  from public.daily_usage
  where user_id = uid and usage_date = d;

  return json_build_object(
    'allowed', coalesce(current_count, 0) < max_count,
    'used', coalesce(current_count, 0),
    'limit', max_count,
    'usage_date', d
  );
end;
$$;

revoke all on function public.claim_solver_usage() from public;
revoke all on function public.claim_solver_usage() from anon;
revoke all on function public.release_solver_usage(uuid) from public;
revoke all on function public.release_solver_usage(uuid) from anon;
revoke all on function public.commit_solver_usage(uuid) from public;
revoke all on function public.commit_solver_usage(uuid) from anon;
revoke all on function public.release_solver_usage() from public;
revoke all on function public.release_solver_usage() from anon;

grant execute on function public.claim_solver_usage() to authenticated;
grant execute on function public.release_solver_usage(uuid) to authenticated;
grant execute on function public.commit_solver_usage(uuid) to authenticated;
grant execute on function public.release_solver_usage() to authenticated;
