-- EasyMath Ai — Free plan: 5 solver questions per UTC day,
-- of which at most 1 may be a photo solve (upload/scan).
-- Practice is unchanged and stays free. Pro remains unlimited (no claim).
--
-- Applied as a Supabase migration. Safe to run once on existing projects:
-- adds photo_count / is_photo columns and replaces usage RPCs.
-- New optional arguments default to false so older app builds keep working.

alter table public.daily_usage
  add column if not exists photo_count integer not null default 0;

alter table public.daily_usage
  drop constraint if exists daily_usage_photo_count_check;

alter table public.daily_usage
  add constraint daily_usage_photo_count_check
  check (photo_count >= 0);

alter table public.guest_daily_usage
  add column if not exists photo_count integer not null default 0;

alter table public.guest_daily_usage
  drop constraint if exists guest_daily_usage_photo_count_check;

alter table public.guest_daily_usage
  add constraint guest_daily_usage_photo_count_check
  check (photo_count >= 0);

alter table public.solver_reservations
  add column if not exists is_photo boolean not null default false;

-- ---------------------------------------------------------------------------
-- Signed-in usage RPCs
-- ---------------------------------------------------------------------------
drop function if exists public.claim_solver_usage();

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
  current_photo integer := 0;
  max_count integer := 5;
  max_photo integer := 1;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(solver_count, 0), coalesce(photo_count, 0)
    into current_count, current_photo
  from public.daily_usage
  where user_id = uid and usage_date = d;

  return json_build_object(
    'allowed', coalesce(current_count, 0) < max_count,
    'used', coalesce(current_count, 0),
    'limit', max_count,
    'photo_used', coalesce(current_photo, 0),
    'photo_limit', max_photo,
    'usage_date', d
  );
end;
$$;

create or replace function public.claim_solver_usage(p_is_photo boolean default false)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  d date := (timezone('utc', now()))::date;
  current_count integer := 0;
  current_photo integer := 0;
  max_count integer := 5;
  max_photo integer := 1;
  reservation_id uuid;
  is_photo boolean := coalesce(p_is_photo, false);
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.daily_usage (user_id, usage_date, solver_count, photo_count)
  values (uid, d, 0, 0)
  on conflict (user_id, usage_date) do nothing;

  select solver_count, photo_count
    into current_count, current_photo
  from public.daily_usage
  where user_id = uid and usage_date = d
  for update;

  if current_count >= max_count then
    return json_build_object(
      'allowed', false,
      'used', current_count,
      'limit', max_count,
      'photo_used', current_photo,
      'photo_limit', max_photo,
      'code', 'DAILY_LIMIT_REACHED',
      'usage_date', d
    );
  end if;

  if is_photo and current_photo >= max_photo then
    return json_build_object(
      'allowed', false,
      'used', current_count,
      'limit', max_count,
      'photo_used', current_photo,
      'photo_limit', max_photo,
      'code', 'PHOTO_LIMIT_REACHED',
      'usage_date', d
    );
  end if;

  update public.daily_usage
  set solver_count = current_count + 1,
      photo_count = current_photo + case when is_photo then 1 else 0 end
  where user_id = uid and usage_date = d;

  insert into public.solver_reservations (user_id, usage_date, status, is_photo)
  values (uid, d, 'pending', is_photo)
  returning id into reservation_id;

  return json_build_object(
    'allowed', true,
    'used', current_count + 1,
    'limit', max_count,
    'photo_used', current_photo + case when is_photo then 1 else 0 end,
    'photo_limit', max_photo,
    'usage_date', d,
    'reservation_id', reservation_id
  );
end;
$$;

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
  current_photo integer := 0;
  max_count integer := 5;
  max_photo integer := 1;
  released_id uuid;
  reservation_date date;
  released_photo boolean := false;
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
    returning id, usage_date, is_photo into released_id, reservation_date, released_photo;
  end if;

  if released_id is not null then
    select coalesce(solver_count, 0), coalesce(photo_count, 0)
      into current_count, current_photo
    from public.daily_usage
    where user_id = uid and usage_date = reservation_date
    for update;

    if current_count is null then
      current_count := 0;
    end if;

    if current_photo is null then
      current_photo := 0;
    end if;

    update public.daily_usage
    set solver_count = case when current_count > 0 then current_count - 1 else current_count end,
        photo_count = case
          when coalesce(released_photo, false) and current_photo > 0 then current_photo - 1
          else current_photo
        end
    where user_id = uid and usage_date = reservation_date;
  end if;

  select coalesce(solver_count, 0), coalesce(photo_count, 0)
    into current_count, current_photo
  from public.daily_usage
  where user_id = uid and usage_date = d;

  return json_build_object(
    'allowed', coalesce(current_count, 0) < max_count,
    'used', coalesce(current_count, 0),
    'limit', max_count,
    'photo_used', coalesce(current_photo, 0),
    'photo_limit', max_photo,
    'usage_date', d
  );
end;
$$;

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
  current_photo integer := 0;
  max_count integer := 5;
  max_photo integer := 1;
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

  select coalesce(solver_count, 0), coalesce(photo_count, 0)
    into current_count, current_photo
  from public.daily_usage
  where user_id = uid and usage_date = d;

  return json_build_object(
    'allowed', coalesce(current_count, 0) < max_count,
    'used', coalesce(current_count, 0),
    'limit', max_count,
    'photo_used', coalesce(current_photo, 0),
    'photo_limit', max_photo,
    'usage_date', d
  );
end;
$$;

revoke all on function public.claim_solver_usage(boolean) from public;
revoke all on function public.claim_solver_usage(boolean) from anon;
revoke all on function public.release_solver_usage(uuid) from public;
revoke all on function public.release_solver_usage(uuid) from anon;
revoke all on function public.commit_solver_usage(uuid) from public;
revoke all on function public.commit_solver_usage(uuid) from anon;
revoke all on function public.get_solver_usage() from public;
revoke all on function public.get_solver_usage() from anon;

grant execute on function public.claim_solver_usage(boolean) to authenticated;
grant execute on function public.release_solver_usage(uuid) to authenticated;
grant execute on function public.commit_solver_usage(uuid) to authenticated;
grant execute on function public.get_solver_usage() to authenticated;

-- ---------------------------------------------------------------------------
-- Guest usage RPCs
-- ---------------------------------------------------------------------------
drop function if exists public.claim_guest_solver_usage(text, text, text);
drop function if exists public.release_guest_solver_usage(text, text, text);

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
  current_photo integer := 0;
  max_count integer := 5;
  max_photo integer := 1;
begin
  if not public.guest_usage_secret_ok(p_secret) then
    raise exception 'Not authorized';
  end if;

  if p_guest_id is null or p_guest_id !~ '^[a-f0-9]{32}$' then
    raise exception 'Invalid guest id';
  end if;

  select coalesce(solver_count, 0), coalesce(photo_count, 0)
    into current_count, current_photo
  from public.guest_daily_usage
  where guest_id = p_guest_id and usage_date = d;

  return json_build_object(
    'allowed', coalesce(current_count, 0) < max_count,
    'used', coalesce(current_count, 0),
    'limit', max_count,
    'photo_used', coalesce(current_photo, 0),
    'photo_limit', max_photo,
    'usage_date', d
  );
end;
$$;

create or replace function public.claim_guest_solver_usage(
  p_guest_id text,
  p_secret text,
  p_ip_id text default null,
  p_is_photo boolean default false
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := (timezone('utc', now()))::date;
  current_count integer := 0;
  current_photo integer := 0;
  ip_count integer := 0;
  ip_photo integer := 0;
  max_count integer := 5;
  max_photo integer := 1;
  is_photo boolean := coalesce(p_is_photo, false);
  lock_first text;
  lock_second text;
  used_count integer;
  used_photo integer;
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

  insert into public.guest_daily_usage (guest_id, usage_date, solver_count, photo_count)
  values (p_guest_id, d, 0, 0)
  on conflict (guest_id, usage_date) do nothing;

  if p_ip_id is not null then
    insert into public.guest_daily_usage (guest_id, usage_date, solver_count, photo_count)
    values (p_ip_id, d, 0, 0)
    on conflict (guest_id, usage_date) do nothing;
  end if;

  if p_ip_id is null then
    select solver_count, photo_count
      into current_count, current_photo
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

    select solver_count, photo_count
      into current_count, current_photo
    from public.guest_daily_usage
    where guest_id = p_guest_id and usage_date = d;

    select solver_count, photo_count
      into ip_count, ip_photo
    from public.guest_daily_usage
    where guest_id = p_ip_id and usage_date = d;
  end if;

  if current_count is null then
    current_count := 0;
  end if;

  if current_photo is null then
    current_photo := 0;
  end if;

  if ip_count is null then
    ip_count := 0;
  end if;

  if ip_photo is null then
    ip_photo := 0;
  end if;

  if current_count >= max_count or (p_ip_id is not null and ip_count >= max_count) then
    used_count := case
      when p_ip_id is not null and ip_count >= max_count and current_count < max_count
        then max_count
      else current_count
    end;

    return json_build_object(
      'allowed', false,
      'used', used_count,
      'limit', max_count,
      'photo_used', current_photo,
      'photo_limit', max_photo,
      'code', 'DAILY_LIMIT_REACHED',
      'usage_date', d
    );
  end if;

  if is_photo and (current_photo >= max_photo or (p_ip_id is not null and ip_photo >= max_photo)) then
    used_photo := case
      when p_ip_id is not null and ip_photo >= max_photo and current_photo < max_photo
        then max_photo
      else current_photo
    end;

    return json_build_object(
      'allowed', false,
      'used', current_count,
      'limit', max_count,
      'photo_used', used_photo,
      'photo_limit', max_photo,
      'code', 'PHOTO_LIMIT_REACHED',
      'usage_date', d
    );
  end if;

  update public.guest_daily_usage
  set solver_count = current_count + 1,
      photo_count = current_photo + case when is_photo then 1 else 0 end
  where guest_id = p_guest_id and usage_date = d;

  if p_ip_id is not null then
    update public.guest_daily_usage
    set solver_count = ip_count + 1,
        photo_count = ip_photo + case when is_photo then 1 else 0 end
    where guest_id = p_ip_id and usage_date = d;
  end if;

  return json_build_object(
    'allowed', true,
    'used', current_count + 1,
    'limit', max_count,
    'photo_used', current_photo + case when is_photo then 1 else 0 end,
    'photo_limit', max_photo,
    'usage_date', d
  );
end;
$$;

create or replace function public.release_guest_solver_usage(
  p_guest_id text,
  p_secret text,
  p_ip_id text default null,
  p_is_photo boolean default false
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := (timezone('utc', now()))::date;
  current_count integer := 0;
  current_photo integer := 0;
  ip_count integer := 0;
  ip_photo integer := 0;
  max_count integer := 5;
  max_photo integer := 1;
  is_photo boolean := coalesce(p_is_photo, false);
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
    select coalesce(solver_count, 0), coalesce(photo_count, 0)
      into current_count, current_photo
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

    select coalesce(solver_count, 0), coalesce(photo_count, 0)
      into current_count, current_photo
    from public.guest_daily_usage
    where guest_id = p_guest_id and usage_date = d;

    select coalesce(solver_count, 0), coalesce(photo_count, 0)
      into ip_count, ip_photo
    from public.guest_daily_usage
    where guest_id = p_ip_id and usage_date = d;
  end if;

  if current_count is null then
    current_count := 0;
  end if;

  if current_photo is null then
    current_photo := 0;
  end if;

  if ip_count is null then
    ip_count := 0;
  end if;

  if ip_photo is null then
    ip_photo := 0;
  end if;

  if current_count > 0 then
    update public.guest_daily_usage
    set solver_count = current_count - 1,
        photo_count = case
          when is_photo and current_photo > 0 then current_photo - 1
          else current_photo
        end
    where guest_id = p_guest_id and usage_date = d;

    current_count := current_count - 1;
    if is_photo and current_photo > 0 then
      current_photo := current_photo - 1;
    end if;
  end if;

  if p_ip_id is not null and ip_count > 0 then
    update public.guest_daily_usage
    set solver_count = ip_count - 1,
        photo_count = case
          when is_photo and ip_photo > 0 then ip_photo - 1
          else ip_photo
        end
    where guest_id = p_ip_id and usage_date = d;
  end if;

  return json_build_object(
    'allowed', current_count < max_count,
    'used', current_count,
    'limit', max_count,
    'photo_used', current_photo,
    'photo_limit', max_photo,
    'usage_date', d
  );
end;
$$;

revoke all on function public.get_guest_solver_usage(text, text) from public;
revoke all on function public.claim_guest_solver_usage(text, text, text, boolean) from public;
revoke all on function public.release_guest_solver_usage(text, text, text, boolean) from public;

grant execute on function public.get_guest_solver_usage(text, text) to anon;
grant execute on function public.get_guest_solver_usage(text, text) to authenticated;
grant execute on function public.claim_guest_solver_usage(text, text, text, boolean) to anon;
grant execute on function public.claim_guest_solver_usage(text, text, text, boolean) to authenticated;
grant execute on function public.release_guest_solver_usage(text, text, text, boolean) to anon;
grant execute on function public.release_guest_solver_usage(text, text, text, boolean) to authenticated;
