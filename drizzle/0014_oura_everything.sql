CREATE TABLE "daily_extras" (
	"member_id" uuid NOT NULL,
	"day" date NOT NULL,
	"activity_score" integer,
	"activity_contributors" jsonb,
	"total_calories" integer,
	"target_calories" integer,
	"equivalent_walking_distance_m" integer,
	"target_meters" integer,
	"meters_to_target" integer,
	"inactivity_alerts" integer,
	"non_wear_minutes" integer,
	"resting_minutes" integer,
	"low_activity_minutes" integer,
	"medium_activity_minutes" integer,
	"high_activity_minutes" integer,
	"average_met_minutes" real,
	"activity_class_5_min" text,
	"sleep_score_delta" integer,
	"readiness_score_delta" integer,
	"movement_30_sec" text,
	"nap_count" integer,
	"nap_minutes" integer,
	"low_battery_alert" boolean,
	"temperature_trend_deviation" real,
	"spo2_average" real,
	"breathing_disturbance_index" integer,
	"resilience_level" text,
	"resilience_contributors" jsonb,
	"vascular_age" integer,
	"vo2_max" real,
	"optimal_bedtime_start" integer,
	"optimal_bedtime_end" integer,
	"bedtime_recommendation" text,
	"bedtime_status" text,
	"heart_rate_buckets" jsonb,
	"heart_rate_summary" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_extras_member_id_day_pk" PRIMARY KEY("member_id","day")
);
--> statement-breakpoint
CREATE TABLE "oura_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source_id" text NOT NULL,
	"day" date NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"label" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oura_events_member_kind_source_uq" UNIQUE("member_id","kind","source_id")
);
--> statement-breakpoint
CREATE TABLE "oura_profile" (
	"member_id" uuid PRIMARY KEY NOT NULL,
	"ring_color" text,
	"ring_design" text,
	"ring_hardware" text,
	"ring_firmware" text,
	"ring_size" integer,
	"ring_set_up_at" timestamp with time zone,
	"battery_level" integer,
	"battery_charging" boolean,
	"battery_at" timestamp with time zone,
	"age" integer,
	"weight_kg" real,
	"height_m" real,
	"biological_sex" text,
	"coverage" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_extras" ADD CONSTRAINT "daily_extras_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oura_events" ADD CONSTRAINT "oura_events_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oura_profile" ADD CONSTRAINT "oura_profile_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oura_events_member_day_idx" ON "oura_events" USING btree ("member_id","day");
--> statement-breakpoint
-- Same lockdown as 0001: not reachable through the Supabase public API (RLS on, nothing for anon/authenticated).
ALTER TABLE "daily_extras" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Same lockdown as 0001: not reachable through the Supabase public API (RLS on, nothing for anon/authenticated).
ALTER TABLE "oura_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Same lockdown as 0001: not reachable through the Supabase public API (RLS on, nothing for anon/authenticated).
ALTER TABLE "oura_profile" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- The app connects as oura_app (docs/supabase-app-role.sql), which is subject to RLS and needs an explicit
-- policy per table. Guarded: the role only exists on Supabase, not on a local Postgres.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['daily_extras', 'oura_events', 'oura_profile'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oura_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO oura_app', t);
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'oura_app full access'
      ) THEN
        EXECUTE format('CREATE POLICY "oura_app full access" ON public.%I FOR ALL TO oura_app USING (true) WITH CHECK (true)', t);
      END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;
