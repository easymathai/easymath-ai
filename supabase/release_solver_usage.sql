-- Follow-up migration for projects that already ran schema.sql
-- Run once in the Supabase SQL Editor.

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

revoke all on function public.release_solver_usage() from public;
grant execute on function public.release_solver_usage() to authenticated;