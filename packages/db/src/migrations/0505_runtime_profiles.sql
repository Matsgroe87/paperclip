-- paperclip:migration-compat online_compatible: Additive fork-only profile table and nullable agent link; existing fork tables and links survive replay. New agent foreign keys are NOT VALID.
CREATE TABLE IF NOT EXISTS "runtime_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"adapter_type" text NOT NULL,
	"adapter_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"runtime_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "runtime_profile_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runtime_profiles_company_id_companies_id_fk' AND conrelid = 'runtime_profiles'::regclass) THEN
 ALTER TABLE "runtime_profiles" ADD CONSTRAINT "runtime_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "runtime_profiles_company_name_idx" ON "runtime_profiles" USING btree ("company_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_profiles_company_adapter_idx" ON "runtime_profiles" USING btree ("company_id","adapter_type");--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'agents'::regclass AND confrelid = 'runtime_profiles'::regclass AND contype = 'f') THEN
 ALTER TABLE "agents" ADD CONSTRAINT "agents_runtime_profile_id_runtime_profiles_id_fk" FOREIGN KEY ("runtime_profile_id") REFERENCES "public"."runtime_profiles"("id") ON DELETE set null ON UPDATE no action NOT VALID;
 END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_company_runtime_profile_idx" ON "agents" USING btree ("company_id","runtime_profile_id");
