
--> statement-breakpoint
-- Same lockdown as 0001: not reachable through the Supabase public API (RLS on, nothing for anon/authenticated).
ALTER TABLE "context_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- The app connects as oura_app (docs/supabase-app-role.sql), which is subject to RLS and needs an explicit
-- policy per table. Guarded: the role only exists on Supabase, not on a local Postgres.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oura_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.context_events TO oura_app;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'context_events' AND policyname = 'oura_app full access'
    ) THEN
      CREATE POLICY "oura_app full access" ON public.context_events FOR ALL TO oura_app USING (true) WITH CHECK (true);
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.context_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.context_events FROM authenticated;
  END IF;
END $$;
