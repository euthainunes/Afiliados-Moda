CREATE TYPE "public"."notification_email_status" AS ENUM('pending', 'sending', 'sent', 'skipped', 'failed');--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "email_notifications" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "email_status" "notification_email_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "email_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "emailed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "notifications_email_queue_idx" ON "notifications" USING btree ("email_status","created_at");--> statement-breakpoint
-- Avisos anteriores a esta versão ficam fora da fila: ninguém recebe e-mails retroativos.
UPDATE "notifications" SET "email_status" = 'skipped';
