CREATE TABLE "runtime_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "adapter_type" text NOT NULL,
  "adapter_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "runtime_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "runtime_profiles_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE "agents"
  ADD COLUMN "runtime_profile_id" uuid
  REFERENCES "public"."runtime_profiles"("id") ON DELETE set null;
--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_profiles_company_name_idx"
  ON "runtime_profiles" USING btree ("company_id", "name");
--> statement-breakpoint
CREATE INDEX "runtime_profiles_company_adapter_idx"
  ON "runtime_profiles" USING btree ("company_id", "adapter_type");
--> statement-breakpoint
CREATE INDEX "agents_company_runtime_profile_idx"
  ON "agents" USING btree ("company_id", "runtime_profile_id");
