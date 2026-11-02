CREATE TABLE "alert_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"recipient_key" text NOT NULL,
	"channel" text NOT NULL,
	"level" text NOT NULL,
	"round" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_deliveries_uq" UNIQUE("alert_id","recipient_key","channel","level","round")
);
--> statement-breakpoint
CREATE TABLE "alert_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"url_enc" text NOT NULL,
	"min_level" text DEFAULT 'urgent' NOT NULL,
	"last_test_at" timestamp with time zone,
	"last_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_participants" (
	"challenge_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "challenge_participants_challenge_id_member_id_pk" PRIMARY KEY("challenge_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_member_id" uuid NOT NULL,
	"title" text NOT NULL,
	"metric" text NOT NULL,
	"scoring" text NOT NULL,
	"start_day" date NOT NULL,
	"end_day" date NOT NULL,
	"invite_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenges_invite_code_unique" UNIQUE("invite_code"),
	CONSTRAINT "challenges_days_ck" CHECK ("challenges"."end_day" >= "challenges"."start_day")
);
--> statement-breakpoint
CREATE TABLE "circle_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_enc" text NOT NULL,
	"email" text,
	"phone" text,
	"via_email" boolean DEFAULT true NOT NULL,
	"via_sms" boolean DEFAULT false NOT NULL,
	"via_call" boolean DEFAULT false NOT NULL,
	"can_view_status" boolean DEFAULT true NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	CONSTRAINT "circle_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "heart_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"rule" text NOT NULL,
	"level" text NOT NULL,
	"raised_for_day" date NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"last_notified_at" timestamp with time zone,
	"notify_round" integer DEFAULT 0 NOT NULL,
	"ack_by" text,
	"ack_circle_id" uuid,
	"ack_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "heart_alerts_member_rule_day_uq" UNIQUE("member_id","rule","raised_for_day")
);
--> statement-breakpoint
CREATE TABLE "heart_settings" (
	"member_id" uuid PRIMARY KEY NOT NULL,
	"monitoring" boolean DEFAULT false NOT NULL,
	"sensitivity" text DEFAULT 'standard' NOT NULL,
	"urgent_enabled" boolean DEFAULT false NOT NULL,
	"rest_hr_max" integer,
	"rest_hr_max_minutes" integer DEFAULT 30 NOT NULL,
	"rest_hr_min" integer,
	"rest_hr_min_minutes" integer DEFAULT 30 NOT NULL,
	"night_hr_max" integer,
	"night_hr_min" integer,
	"spo2_min" integer,
	"escalate_after_minutes" integer DEFAULT 15 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_prefs" (
	"member_id" uuid PRIMARY KEY NOT NULL,
	"focus_areas" text[],
	"onboarded_at" timestamp with time zone,
	"circle_name" text,
	"circle_phone" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_alert_id_heart_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."heart_alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_devices" ADD CONSTRAINT "alert_devices_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_creator_member_id_members_id_fk" FOREIGN KEY ("creator_member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_links" ADD CONSTRAINT "circle_links_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heart_alerts" ADD CONSTRAINT "heart_alerts_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heart_alerts" ADD CONSTRAINT "heart_alerts_ack_circle_id_circle_links_id_fk" FOREIGN KEY ("ack_circle_id") REFERENCES "public"."circle_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heart_settings" ADD CONSTRAINT "heart_settings_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_prefs" ADD CONSTRAINT "member_prefs_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_devices_member_idx" ON "alert_devices" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "challenge_participants_member_idx" ON "challenge_participants" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "challenges_creator_idx" ON "challenges" USING btree ("creator_member_id");--> statement-breakpoint
CREATE INDEX "circle_links_member_idx" ON "circle_links" USING btree ("member_id","created_at");--> statement-breakpoint
CREATE INDEX "heart_alerts_member_status_idx" ON "heart_alerts" USING btree ("member_id","status");
--> statement-breakpoint
-- Same lockdown as 0001 and the oura_app policy as 0003/0013/0016: nothing here is reachable through the
-- Supabase public API, and the app role gets a policy per table.
ALTER TABLE "member_prefs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "heart_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "circle_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "alert_devices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "heart_alerts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "alert_deliveries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "challenges" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "challenge_participants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['member_prefs', 'heart_settings', 'circle_links', 'alert_devices', 'heart_alerts', 'alert_deliveries', 'challenges', 'challenge_participants'] LOOP
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
