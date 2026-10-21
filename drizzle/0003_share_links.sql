CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_enc" text NOT NULL,
	"recipient_role" "doctor_role",
	"recipient_label" text,
	"patient_name" text,
	"note" text,
	"window_days" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	CONSTRAINT "share_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_links_member_idx" ON "share_links" USING btree ("member_id","created_at");--> statement-breakpoint
-- Same lockdown as 0001: nothing here may be reachable through the Supabase public API.
ALTER TABLE "share_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- The app connects as `oura_app` (docs/supabase-app-role.sql), which is subject to RLS and needs an
-- explicit policy per table. 0002 enabled RLS on doctor_contacts without one, so add both here.
-- Guarded: the role only exists on Supabase, not on a local Postgres.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oura_app') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'share_links' AND policyname = 'oura_app full access') THEN
      CREATE POLICY "oura_app full access" ON public.share_links FOR ALL TO oura_app USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'doctor_contacts' AND policyname = 'oura_app full access') THEN
      CREATE POLICY "oura_app full access" ON public.doctor_contacts FOR ALL TO oura_app USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
