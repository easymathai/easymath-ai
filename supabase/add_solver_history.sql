-- EasyMath AI — signed-in solver history (Recent Questions) on profiles
-- Run once in the Supabase SQL Editor on existing projects.
-- Safe for existing rows: defaults to []. Does not change plan, usage, or RLS.

alter table public.profiles
  add column if not exists solver_history jsonb not null default '[]'::jsonb;
