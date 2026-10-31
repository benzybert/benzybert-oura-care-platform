CREATE TABLE "experiment_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"idea" text NOT NULL,
	"suggested_by" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestion_boxes" (
	"member_id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suggestion_boxes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "experiment_suggestions" ADD CONSTRAINT "experiment_suggestions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_boxes" ADD CONSTRAINT "suggestion_boxes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "experiment_suggestions_member_idx" ON "experiment_suggestions" USING btree ("member_id","created_at");
--> statement-breakpoint
-- Same lockdown as 0001 and the oura_app policy as 0003/0013 (see there).
ALTER TABLE "suggestion_boxes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "experiment_suggestions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['suggestion_boxes', 'experiment_suggestions'] LOOP
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
