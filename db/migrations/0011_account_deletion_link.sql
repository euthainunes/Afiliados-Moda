ALTER TYPE "public"."auth_token_type" ADD VALUE 'account_deletion';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "has_password" boolean DEFAULT true NOT NULL;