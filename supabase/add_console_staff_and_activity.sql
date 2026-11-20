-- Owner console staff, staff-change audit, and sign-in activity.
-- RLS enabled; no client policies. Service role only.

create table if not exists public.console_staff (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null default 'staff' check (role = 'staff'),
  added_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists console_staff_email_idx on public.console_staff (lower(email));

alter table public.console_staff enable row level security;

revoke all on table public.console_staff from public;
revoke all on table public.console_staff from anon;
revoke all on table public.console_staff from authenticated;
grant all on table public.console_staff to service_role;

create table if not exists public.console_staff_audit (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  actor_role text not null,
  action text not null check (action in ('add_staff', 'remove_staff')),
  target_email text not null,
  created_at timestamptz not null default now()
);

create index if not exists console_staff_audit_created_at_idx on public.console_staff_audit (created_at desc);

alter table public.console_staff_audit enable row level security;

revoke all on table public.console_staff_audit from public;
revoke all on table public.console_staff_audit from anon;
revoke all on table public.console_staff_audit from authenticated;
grant all on table public.console_staff_audit to service_role;

create table if not exists public.console_auth_activity (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null,
  event text not null check (event in ('sign_in', 'sign_out')),
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists console_auth_activity_created_at_idx on public.console_auth_activity (created_at desc);
create index if not exists console_auth_activity_email_event_idx on public.console_auth_activity (email, event, created_at desc);

alter table public.console_auth_activity enable row level security;

revoke all on table public.console_auth_activity from public;
revoke all on table public.console_auth_activity from anon;
revoke all on table public.console_auth_activity from authenticated;
grant all on table public.console_auth_activity to service_role;
