-- EasyMath Ai — "Report wrong answer" feedback (solution_feedback)
-- Applied to project lybfjdfgjwwdycubxwcx as migration "add_solution_feedback".
-- Safe to re-run.
--
-- Rows are written only by the server (/api/feedback) with the Secret key,
-- after rate limiting. Signed-in students may read their own reports.
-- Guests are stored only as a SHA-256 hash of their signed guest id; no raw
-- IPs or emails are stored.

create table if not exists public.solution_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  user_id uuid references auth.users (id) on delete set null,
  guest_key text check (guest_key is null or char_length(guest_key) <= 64),
  platform text not null default 'web'
    check (platform in ('web', 'android', 'ios', 'unknown')),
  source text not null default 'text'
    check (source in ('text', 'photo', 'practice')),
  reason text not null
    check (reason in ('wrong_answer', 'wrong_steps', 'misread_photo', 'unclear', 'other')),
  comment text check (comment is null or char_length(comment) <= 1000),
  question text not null check (char_length(question) <= 2000),
  solution text check (solution is null or char_length(solution) <= 20000),
  level text check (level is null or level in ('primary', 'middle', 'high', 'advanced')),
  app_version text check (app_version is null or char_length(app_version) <= 32),
  status text not null default 'new'
    check (status in ('new', 'reviewed', 'fixed', 'dismissed'))
);

create index if not exists solution_feedback_created_at_idx
  on public.solution_feedback (created_at desc);

create index if not exists solution_feedback_user_id_idx
  on public.solution_feedback (user_id)
  where user_id is not null;

create index if not exists solution_feedback_status_idx
  on public.solution_feedback (status, created_at desc);

alter table public.solution_feedback enable row level security;

revoke all on table public.solution_feedback from public;
revoke all on table public.solution_feedback from anon;
revoke all on table public.solution_feedback from authenticated;

grant select on table public.solution_feedback to authenticated;

drop policy if exists "Students can read their own feedback" on public.solution_feedback;
create policy "Students can read their own feedback"
  on public.solution_feedback
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- No insert/update/delete policies: only the server (service role) writes.
