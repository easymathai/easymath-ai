-- EasyMath AI — minimum Supabase schema
-- Run this in the Supabase SQL Editor after creating your project.
-- Requires: Authentication → Email provider enabled.

-- ---------------------------------------------------------------------------
-- 1) Profiles (cloud student progress)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  plan text not null default 'free'
    check (plan in ('free', 'pro')),
  student_level text not null default 'middle'
    check (student_level in ('primary', 'middle', 'high', 'advanced')),
  practice_topic text not null default 'mixed'
    check (
      practice_topic in (
        'arithmetic',
        'algebra',
        'fractions',
        'percentages',
        'geometry',
        'equations',
        'mixed'
      )
    ),
  questions_solved integer not null default 0 check (questions_solved >= 0),
  practice_attempted integer not null default 0 check (practice_attempted >= 0),
  practice_correct integer not null default 0 check (practice_correct >= 0),
  activity jsonb not null default '[]'::jsonb,
  practice_progress jsonb not null default '{}'::jsonb,
  solver_history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists profiles_updated_at_idx on public.profiles (updated_at desc);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Prevent authenticated end-users from self-upgrading plan via client writes.
-- Privileged SQL Editor / service_role updates can still set plan = 'pro'.
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
    return new;
  end if;

  if tg_op = 'UPDATE' then
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

-- Auto-create a profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, plan)
  values (new.id, new.email, 'free')
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2) Daily solver usage (Free plan: 10 text+photo solves per UTC day)
-- ---------------------------------------------------------------------------
create table if not exists public.daily_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null,
  solver_count integer not null default 0 check (solver_count >= 0),
  primary key (user_id, usage_date)
);

alter table public.daily_usage enable row level security;

-- Users may read their own usage. Increments happen only via RPC below.
drop policy if exists "daily_usage_select_own" on public.daily_usage;
create policy "daily_usage_select_own"
  on public.daily_usage for select
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3) Secure RPCs for Free-plan limit (server-side enforcement)
-- ---------------------------------------------------------------------------
create or replace function public.get_solver_usage()
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

  select coalesce(solver_count, 0) into current_count
  from public.daily_usage
  where user_id = uid and usage_date = d;

  return json_build_object(
    'allowed', current_count < max_count,
    'used', coalesce(current_count, 0),
    'limit', max_count,
    'usage_date', d
  );
end;
$$;

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

  return json_build_object(
    'allowed', true,
    'used', current_count + 1,
    'limit', max_count,
    'usage_date', d
  );
end;
$$;

-- Undo a claim when a solve fails after reservation (keeps Free plan fair).
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
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(solver_count, 0) into current_count
  from public.daily_usage
  where user_id = uid and usage_date = d
  for update;

  if current_count is null then
    current_count := 0;
  end if;

  if current_count > 0 then
    update public.daily_usage
    set solver_count = current_count - 1
    where user_id = uid and usage_date = d;

    current_count := current_count - 1;
  end if;

  return json_build_object(
    'allowed', current_count < max_count,
    'used', current_count,
    'limit', max_count,
    'usage_date', d
  );
end;
$$;

revoke all on function public.get_solver_usage() from public;
revoke all on function public.claim_solver_usage() from public;
revoke all on function public.release_solver_usage() from public;
grant execute on function public.get_solver_usage() to authenticated;
grant execute on function public.claim_solver_usage() to authenticated;
grant execute on function public.release_solver_usage() to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Guest solver daily usage (signed HTTP-only cookie identity)
-- Signed-in Free/Pro usage stays in daily_usage above and is never mixed.
-- Store SHA-256(GUEST_USAGE_SECRET) in guest_usage_secrets.secret_hash.
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.guest_usage_secrets (
  id smallint primary key default 1 check (id = 1),
  secret_hash text not null check (secret_hash ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.guest_usage_secrets enable row level security;

revoke all on table public.guest_usage_secrets from public;
revoke all on table public.guest_usage_secrets from anon;
revoke all on table public.guest_usage_secrets from authenticated;

create table if not exists public.guest_daily_usage (
  guest_id text not null
    check (guest_id ~ '^[a-f0-9]{32}$'),
  usage_date date not null,
  solver_count integer not null default 0 check (solver_count >= 0),
  primary key (guest_id, usage_date)
);

alter table public.guest_daily_usage enable row level security;

revoke all on table public.guest_daily_usage from public;
revoke all on table public.guest_daily_usage from anon;
revoke all on table public.guest_daily_usage from authenticated;

create or replace function public.guest_usage_secret_ok(p_secret text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  incoming_hash text;
begin
  if p_secret is null or char_length(p_secret) < 16 then
    return false;
  end if;

  incoming_hash := encode(
    extensions.digest(convert_to(p_secret, 'utf8'), 'sha256'),
    'hex'
  );

  return exists (
    select 1
    from public.guest_usage_secrets
    where id = 1
      and secret_hash = incoming_hash
  );
end;
$$;

revoke all on function public.guest_usage_secret_ok(text) from public;
revoke all on function public.guest_usage_secret_ok(text) from anon;
revoke all on function public.guest_usage_secret_ok(text) from authenticated;

create or replace function public.get_guest_solver_usage(
  p_guest_id text,
  p_secret text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := (timezone('utc', now()))::date;
  current_count integer := 0;
  max_count integer := 10;
begin
  if not public.guest_usage_secret_ok(p_secret) then
    raise exception 'Not authorized';
  end if;

  if p_guest_id is null or p_guest_id !~ '^[a-f0-9]{32}$' then
    raise exception 'Invalid guest id';
  end if;

  select coalesce(solver_count, 0) into current_count
  from public.guest_daily_usage
  where guest_id = p_guest_id and usage_date = d;

  -- Usage counters only. Never return secret_hash or p_secret.
  return json_build_object(
    'allowed', coalesce(current_count, 0) < max_count,
    'used', coalesce(current_count, 0),
    'limit', max_count,
    'usage_date', d
  );
end;
$$;

create or replace function public.claim_guest_solver_usage(
  p_guest_id text,
  p_secret text,
  p_ip_id text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := (timezone('utc', now()))::date;
  current_count integer := 0;
  ip_count integer := 0;
  max_count integer := 10;
  lock_first text;
  lock_second text;
begin
  if not public.guest_usage_secret_ok(p_secret) then
    raise exception 'Not authorized';
  end if;

  if p_guest_id is null or p_guest_id !~ '^[a-f0-9]{32}$' then
    raise exception 'Invalid guest id';
  end if;

  if p_ip_id is not null and p_ip_id !~ '^[a-f0-9]{32}$' then
    raise exception 'Invalid guest id';
  end if;

  if p_ip_id is not null and p_ip_id = p_guest_id then
    p_ip_id := null;
  end if;

  insert into public.guest_daily_usage (guest_id, usage_date, solver_count)
  values (p_guest_id, d, 0)
  on conflict (guest_id, usage_date) do nothing;

  if p_ip_id is not null then
    insert into public.guest_daily_usage (guest_id, usage_date, solver_count)
    values (p_ip_id, d, 0)
    on conflict (guest_id, usage_date) do nothing;
  end if;

  if p_ip_id is null then
    select solver_count into current_count
    from public.guest_daily_usage
    where guest_id = p_guest_id and usage_date = d
    for update;
  else
    if p_guest_id < p_ip_id then
      lock_first := p_guest_id;
      lock_second := p_ip_id;
    else
      lock_first := p_ip_id;
      lock_second := p_guest_id;
    end if;

    perform solver_count
    from public.guest_daily_usage
    where guest_id = lock_first and usage_date = d
    for update;

    perform solver_count
    from public.guest_daily_usage
    where guest_id = lock_second and usage_date = d
    for update;

    select solver_count into current_count
    from public.guest_daily_usage
    where guest_id = p_guest_id and usage_date = d;

    select solver_count into ip_count
    from public.guest_daily_usage
    where guest_id = p_ip_id and usage_date = d;
  end if;

  if current_count >= max_count or (p_ip_id is not null and ip_count >= max_count) then
    return json_build_object(
      'allowed', false,
      'used', case
        when p_ip_id is not null and ip_count >= max_count and current_count < max_count
          then max_count
        else current_count
      end,
      'limit', max_count,
      'usage_date', d
    );
  end if;

  update public.guest_daily_usage
  set solver_count = current_count + 1
  where guest_id = p_guest_id and usage_date = d;

  if p_ip_id is not null then
    update public.guest_daily_usage
    set solver_count = ip_count + 1
    where guest_id = p_ip_id and usage_date = d;
  end if;

  return json_build_object(
    'allowed', true,
    'used', current_count + 1,
    'limit', max_count,
    'usage_date', d
  );
end;
$$;

create or replace function public.release_guest_solver_usage(
  p_guest_id text,
  p_secret text,
  p_ip_id text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := (timezone('utc', now()))::date;
  current_count integer := 0;
  ip_count integer := 0;
  max_count integer := 10;
  lock_first text;
  lock_second text;
begin
  if not public.guest_usage_secret_ok(p_secret) then
    raise exception 'Not authorized';
  end if;

  if p_guest_id is null or p_guest_id !~ '^[a-f0-9]{32}$' then
    raise exception 'Invalid guest id';
  end if;

  if p_ip_id is not null and p_ip_id !~ '^[a-f0-9]{32}$' then
    raise exception 'Invalid guest id';
  end if;

  if p_ip_id is not null and p_ip_id = p_guest_id then
    p_ip_id := null;
  end if;

  if p_ip_id is null then
    select coalesce(solver_count, 0) into current_count
    from public.guest_daily_usage
    where guest_id = p_guest_id and usage_date = d
    for update;
  else
    if p_guest_id < p_ip_id then
      lock_first := p_guest_id;
      lock_second := p_ip_id;
    else
      lock_first := p_ip_id;
      lock_second := p_guest_id;
    end if;

    perform coalesce(solver_count, 0)
    from public.guest_daily_usage
    where guest_id = lock_first and usage_date = d
    for update;

    perform coalesce(solver_count, 0)
    from public.guest_daily_usage
    where guest_id = lock_second and usage_date = d
    for update;

    select coalesce(solver_count, 0) into current_count
    from public.guest_daily_usage
    where guest_id = p_guest_id and usage_date = d;

    select coalesce(solver_count, 0) into ip_count
    from public.guest_daily_usage
    where guest_id = p_ip_id and usage_date = d;
  end if;

  if current_count is null then
    current_count := 0;
  end if;

  if ip_count is null then
    ip_count := 0;
  end if;

  if current_count > 0 then
    update public.guest_daily_usage
    set solver_count = current_count - 1
    where guest_id = p_guest_id and usage_date = d;

    current_count := current_count - 1;
  end if;

  if p_ip_id is not null and ip_count > 0 then
    update public.guest_daily_usage
    set solver_count = ip_count - 1
    where guest_id = p_ip_id and usage_date = d;
  end if;

  return json_build_object(
    'allowed', current_count < max_count,
    'used', current_count,
    'limit', max_count,
    'usage_date', d
  );
end;
$$;

revoke all on function public.get_guest_solver_usage(text, text) from public;
revoke all on function public.claim_guest_solver_usage(text, text, text) from public;
revoke all on function public.release_guest_solver_usage(text, text, text) from public;

grant execute on function public.get_guest_solver_usage(text, text) to anon;
grant execute on function public.get_guest_solver_usage(text, text) to authenticated;
grant execute on function public.claim_guest_solver_usage(text, text, text) to anon;
grant execute on function public.claim_guest_solver_usage(text, text, text) to authenticated;
grant execute on function public.release_guest_solver_usage(text, text, text) to anon;
grant execute on function public.release_guest_solver_usage(text, text, text) to authenticated;
