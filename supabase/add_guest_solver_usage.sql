-- EasyMath AI — guest solver daily usage (cookie identity)
-- Run once in the Supabase SQL Editor on existing projects.
-- Does NOT change profiles.plan, daily_usage, or signed-in Free/Pro RPCs.
--
-- After this script, insert the SHA-256 hash of GUEST_USAGE_SECRET (not the raw secret):
--
--   printf '%s' 'YOUR_GUEST_USAGE_SECRET' | openssl dgst -sha256
--
-- Copy only the 64-character hex digest, then:
--
--   insert into public.guest_usage_secrets (id, secret_hash)
--   values (1, 'paste-64-char-hex-sha256-here')
--   on conflict (id) do update set secret_hash = excluded.secret_hash;
--
-- Anonymous clients cannot read or write these tables (RLS on, no policies).
-- RPCs hash p_secret with pgcrypto and compare; they never return the stored hash.

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
