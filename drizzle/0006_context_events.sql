-- Fresh-database repair (idempotent, a no-op where this migration already ran): the original file
-- lost its CREATE statements, and the daily_metrics.stress_* columns from the same schema change
-- were never written to any migration. Production has all of them; a new database now does too.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'context_event_kind') THEN
    CREATE TYPE "public"."context_event_kind" AS ENUM('war', 'pandemic', 'disaster', 'other');
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "context_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"kind" "context_event_kind" NOT NULL,
	"title_he" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"last_seen_on" date,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "context_events_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD COLUMN IF NOT EXISTS "stress_minutes" integer;
--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD COLUMN IF NOT EXISTS "recovery_minutes" integer;
--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD COLUMN IF NOT EXISTS "stress_summary" text;
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
