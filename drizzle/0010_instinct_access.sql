CREATE TABLE "instinct_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"read_count" integer DEFAULT 0 NOT NULL,
	"last_read_at" timestamp with time zone,
	CONSTRAINT "instinct_access_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "instinct_access" ADD CONSTRAINT "instinct_access_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "instinct_access_member_idx" ON "instinct_access" USING btree ("member_id","created_at");
--> statement-breakpoint
ALTER TABLE "instinct_access" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oura_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.instinct_access TO oura_app;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'instinct_access' AND policyname = 'oura_app full access'
    ) THEN
      CREATE POLICY "oura_app full access" ON public.instinct_access FOR ALL TO oura_app USING (true) WITH CHECK (true);
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.instinct_access FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.instinct_access FROM authenticated;
  END IF;
END $$;
