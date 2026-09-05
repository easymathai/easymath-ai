-- EasyMath AI — signed-in dashboard streak + per-topic practice stats
-- Run once in the Supabase SQL Editor on existing projects.
-- Safe for existing rows: defaults to {}. Does not change plan, usage, or RLS.

alter table public.profiles
  add column if not exists dashboard_stats jsonb not null default '{}'::jsonb;
