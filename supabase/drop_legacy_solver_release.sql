-- EasyMath AI — STAGE B (post-deploy cleanup)
-- Run once in the Supabase SQL Editor AFTER the new Next.js app is deployed.
-- Do NOT run from the app.
-- Do NOT run this before Stage A (add_solver_reservations.sql) or before
-- the new app is live: the old app still needs the zero-argument overload.
--
-- Permanently removes the TEMPORARY / LEGACY COMPATIBILITY overload:
--   public.release_solver_usage()          -- zero arguments
--
-- Does NOT drop:
--   public.release_solver_usage(uuid)
--   public.commit_solver_usage(uuid)
--   public.claim_solver_usage()
--   public.solver_reservations

drop function if exists public.release_solver_usage();
