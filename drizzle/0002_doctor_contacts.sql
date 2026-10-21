CREATE TYPE "public"."doctor_role" AS ENUM('neurologist', 'family_doctor');--> statement-breakpoint
CREATE TABLE "doctor_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"role" "doctor_role" NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_contacts_member_role_uq" UNIQUE("member_id","role")
);
--> statement-breakpoint
ALTER TABLE "doctor_contacts" ADD CONSTRAINT "doctor_contacts_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Same lockdown as 0001: health-adjacent data must not be reachable through the Supabase public API.
ALTER TABLE "doctor_contacts" ENABLE ROW LEVEL SECURITY;
