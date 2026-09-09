-- DEPRECATED — do not recreate the old signed-in refund RPC.
--
-- The historical zero-argument public.release_solver_usage() performed a
-- naked decrement of daily_usage.solver_count. Any authenticated user could
-- call it repeatedly and drain Free-plan credits. That implementation is
-- insecure and must not be restored.
--
-- Safe to run: this file only drops the zero-argument overload if it still
-- exists. It does not create any function. It does not drop
-- public.release_solver_usage(uuid).
--
-- Official rollout:
--   Stage A: supabase/add_solver_reservations.sql
--   Deploy the new Next.js app
--   Stage B: supabase/drop_legacy_solver_release.sql

drop function if exists public.release_solver_usage();
