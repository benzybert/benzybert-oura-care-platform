ALTER TABLE "automation_rules" ADD COLUMN "provider" text DEFAULT 'home_assistant' NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD COLUMN "webhook_key_enc" text;