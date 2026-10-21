CREATE TYPE "public"."self_reward_kind" AS ENUM('average', 'days_hit', 'streak', 'beat_baseline', 'consistency');--> statement-breakpoint
CREATE TYPE "public"."self_reward_metric" AS ENUM('sleep_score', 'readiness_score', 'total_sleep_hours', 'steps', 'average_hrv', 'lowest_heart_rate', 'bedtime');--> statement-breakpoint
CREATE TABLE "self_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"title" text,
	"emoji" text,
	"kind" "self_reward_kind" NOT NULL,
	"metric" "self_reward_metric" NOT NULL,
	"target" real NOT NULL,
	"required_days" integer,
	"window_days" integer NOT NULL,
	"start_day" date NOT NULL,
	"baseline" real,
	"allow_single_miss" boolean DEFAULT true NOT NULL,
	"reward_options" text[] NOT NULL,
	"reward_budget" integer,
	"claimed_at" timestamp with time zone,
	"claimed_reward" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "self_rewards" ADD CONSTRAINT "self_rewards_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "self_rewards_member_idx" ON "self_rewards" USING btree ("member_id");--> statement-breakpoint
-- Same lockdown as 0001: not reachable through the Supabase public API (RLS on, nothing for anon/authenticated).
ALTER TABLE "self_rewards" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- The app connects as oura_app (docs/supabase-app-role.sql), which is subject to RLS and needs an explicit
-- policy per table. Guarded: the role only exists on Supabase, not on a local Postgres.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oura_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.self_rewards TO oura_app;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'self_rewards' AND policyname = 'oura_app full access'
    ) THEN
      CREATE POLICY "oura_app full access" ON public.self_rewards FOR ALL TO oura_app USING (true) WITH CHECK (true);
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.self_rewards FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.self_rewards FROM authenticated;
  END IF;
END $$;
