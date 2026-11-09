CREATE TABLE "apple_health_daily" (
	"member_id" uuid NOT NULL,
	"day" date NOT NULL,
	"steps" integer,
	"active_kcal" integer,
	"exercise_min" integer,
	"distance_km" real,
	"resting_hr" real,
	"hrv_sdnn" real,
	"resp_rate" real,
	"spo2" real,
	"vo2_max" real,
	"weight_kg" real,
	"sleep_asleep_min" integer,
	"sleep_deep_min" integer,
	"sleep_rem_min" integer,
	"sleep_core_min" integer,
	"sleep_awake_min" integer,
	"workouts" integer,
	"workout_min" integer,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apple_health_daily_member_id_day_pk" PRIMARY KEY("member_id","day")
);
--> statement-breakpoint
ALTER TABLE "apple_health_daily" ADD CONSTRAINT "apple_health_daily_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Same lockdown as 0001 and the oura_app policy as 0003/0016/0019 (see there).
ALTER TABLE "apple_health_daily" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oura_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.apple_health_daily TO oura_app;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'apple_health_daily' AND policyname = 'oura_app full access'
    ) THEN
      CREATE POLICY "oura_app full access" ON public.apple_health_daily FOR ALL TO oura_app USING (true) WITH CHECK (true);
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.apple_health_daily FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.apple_health_daily FROM authenticated;
  END IF;
END $$;
