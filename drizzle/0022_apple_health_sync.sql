CREATE TABLE "apple_health_buckets" (
	"member_id" uuid NOT NULL,
	"day" date NOT NULL,
	"field" text NOT NULL,
	"value" real,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apple_health_buckets_member_id_day_field_pk" PRIMARY KEY("member_id","day","field")
);
--> statement-breakpoint
CREATE TABLE "apple_health_links" (
	"member_id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"token_enc" text NOT NULL,
	"puls_user" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_seen_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"last_data_at" timestamp with time zone,
	"batches" integer DEFAULT 0 NOT NULL,
	"fields_seen" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "apple_health_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "apple_health_samples" (
	"member_id" uuid NOT NULL,
	"uuid" text NOT NULL,
	"metric" text NOT NULL,
	"day" date NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"wall" text NOT NULL,
	"value" real,
	"sleep_kind" text,
	"source" text DEFAULT '' NOT NULL,
	CONSTRAINT "apple_health_samples_member_id_uuid_pk" PRIMARY KEY("member_id","uuid")
);
--> statement-breakpoint
ALTER TABLE "apple_health_buckets" ADD CONSTRAINT "apple_health_buckets_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apple_health_links" ADD CONSTRAINT "apple_health_links_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apple_health_samples" ADD CONSTRAINT "apple_health_samples_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apple_health_samples_member_day_idx" ON "apple_health_samples" USING btree ("member_id","day");--> statement-breakpoint
-- Same lockdown as 0001 and the oura_app policy as 0003/0016/0019/0020 (see there).
ALTER TABLE "apple_health_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "apple_health_samples" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "apple_health_buckets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['apple_health_links', 'apple_health_samples', 'apple_health_buckets'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oura_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO oura_app', t);
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'oura_app full access') THEN
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
