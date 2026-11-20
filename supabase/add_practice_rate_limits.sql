-- EasyMath Ai — Practice Mode abuse limits (version 2)
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- NOT applied automatically. Until it is applied, the app falls back to a
-- best-effort in-memory limiter per server instance (see lib/practice-rate-limit.ts).
--
-- Only the server (service_role / secret key) can call the RPC.
-- Keys are SHA-256 hashes of user ids / guest ids / hashed IPs; no raw IPs or emails stored.

create table if not exists public.practice_rate_limits (
  key text not null,
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (key, bucket, window_start)
);

create index if not exists practice_rate_limits_updated_at_idx
  on public.practice_rate_limits (updated_at);

alter table public.practice_rate_limits enable row level security;

revoke all on table public.practice_rate_limits from public;
revoke all on table public.practice_rate_limits from anon;
revoke all on table public.practice_rate_limits from authenticated;

create or replace function public.consume_practice_rate_limit(
  p_key text,
  p_bucket text,
  p_window_seconds integer,
  p_limit integer
)
returns table (allowed boolean, used integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_window_start timestamptz;
  v_count integer;
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 128
     or p_bucket is null or length(p_bucket) = 0 or length(p_bucket) > 64
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 604800
     or p_limit is null or p_limit < 0 then
    raise exception 'invalid practice rate limit arguments';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  insert into public.practice_rate_limits as r (key, bucket, window_start, count, updated_at)
  values (p_key, p_bucket, v_window_start, 1, v_now)
  on conflict (key, bucket, window_start)
  do update set count = r.count + 1, updated_at = v_now
  returning r.count into v_count;

  -- Opportunistic cleanup of old windows (cheap, bounded).
  if random() < 0.01 then
    delete from public.practice_rate_limits
    where ctid in (
      select ctid from public.practice_rate_limits
      where updated_at < v_now - interval '2 days'
      limit 500
    );
  end if;

  allowed := v_count <= p_limit;
  used := v_count;
  retry_after_seconds := case
    when v_count <= p_limit then 0
    else greatest(1, ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - v_now)))::integer)
  end;
  return next;
end;
$$;

revoke all on function public.consume_practice_rate_limit(text, text, integer, integer) from public;
revoke all on function public.consume_practice_rate_limit(text, text, integer, integer) from anon;
revoke all on function public.consume_practice_rate_limit(text, text, integer, integer) from authenticated;
grant execute on function public.consume_practice_rate_limit(text, text, integer, integer) to service_role;
