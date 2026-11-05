CREATE TABLE "custom_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"name" text NOT NULL,
	"widgets" text[] NOT NULL,
	"days" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"taken_on" date NOT NULL,
	"lab" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"biomarker" text NOT NULL,
	"name" text,
	"value" real NOT NULL,
	"unit" text,
	"ref_low" real,
	"ref_high" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"dose" text,
	"times" text[] DEFAULT '{}'::text[] NOT NULL,
	"reason" text,
	"started_on" date,
	"stopped_on" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_views" ADD CONSTRAINT "custom_views_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_reports" ADD CONSTRAINT "lab_reports_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_report_id_lab_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."lab_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_views_member_idx" ON "custom_views" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "lab_reports_member_idx" ON "lab_reports" USING btree ("member_id","taken_on");--> statement-breakpoint
CREATE INDEX "lab_results_member_idx" ON "lab_results" USING btree ("member_id","biomarker");--> statement-breakpoint
CREATE INDEX "lab_results_report_idx" ON "lab_results" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "medications_member_idx" ON "medications" USING btree ("member_id");
--> statement-breakpoint
-- Same lockdown as 0001 and the oura_app policy as 0003/0013/0016/0017: nothing here is reachable through the
-- Supabase public API, and the app role gets a policy per table.
ALTER TABLE "medications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lab_reports" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lab_results" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "custom_views" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['medications', 'lab_reports', 'lab_results', 'custom_views'] LOOP
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
