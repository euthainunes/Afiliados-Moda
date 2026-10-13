CREATE TYPE "public"."integration_kind" AS ENUM('order_source', 'email', 'payouts');--> statement-breakpoint
CREATE TYPE "public"."integration_mode" AS ENUM('disabled', 'demo', 'live');--> statement-breakpoint
CREATE TYPE "public"."integration_provider" AS ENUM('demo', 'vtex', 'console', 'resend', 'manual_pix');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."adjustment_status" AS ENUM('proposed', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."conversion_state" AS ENUM('registered', 'in_validation', 'approved', 'rejected', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('issued', 'paid', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."ledger_account" AS ENUM('brand_receivable_estimated', 'brand_receivable_confirmed', 'cash', 'user_reward_pending', 'user_reward_eligible', 'user_reward_in_payout', 'platform_revenue_estimated', 'platform_revenue_confirmed', 'adjustments');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('created', 'paid', 'invoiced', 'delivered', 'canceled', 'returned');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('requested', 'approved', 'rejected', 'paid', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_status" AS ENUM('open', 'explained');--> statement-breakpoint
CREATE TYPE "public"."ticket_category" AS ENUM('conta', 'looks', 'recompensas', 'resgate', 'privacidade', 'marca', 'outro');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'answered', 'closed');--> statement-breakpoint
CREATE TABLE "integration_sync_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"mode" "integration_mode" NOT NULL,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"attempts" integer DEFAULT 1 NOT NULL,
	"counters" jsonb,
	"error" text,
	"error_sample" jsonb
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "integration_kind" NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"brand_id" uuid,
	"name" text NOT NULL,
	"mode" "integration_mode" DEFAULT 'disabled' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_env" text[] DEFAULT '{}' NOT NULL,
	"cursor" text,
	"last_success_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"conversion_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	CONSTRAINT "brand_invoice_items_conversion_id_unique" UNIQUE("conversion_id")
);
--> statement-breakpoint
CREATE TABLE "brand_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"amount_cents" bigint NOT NULL,
	"status" "invoice_status" DEFAULT 'issued' NOT NULL,
	"issued_by" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "brand_invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "brand_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"reference" text NOT NULL,
	"simulated" boolean DEFAULT false NOT NULL,
	"registered_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"click_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"look_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"campaign_id" uuid,
	"commission_rule_id" uuid,
	"rule_snapshot" jsonb,
	"state" "conversion_state" NOT NULL,
	"rejection_reason" text,
	"base_amount_cents" bigint DEFAULT 0 NOT NULL,
	"commission_cents" bigint DEFAULT 0 NOT NULL,
	"user_reward_cents" bigint DEFAULT 0 NOT NULL,
	"platform_cents" bigint DEFAULT 0 NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"eligible_from" timestamp with time zone,
	"eligible_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversions_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "conversions_split" CHECK ("conversions"."user_reward_cents" + "conversions"."platform_cents" = "conversions"."commission_cents")
);
--> statement-breakpoint
CREATE TABLE "ledger_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversion_id" uuid,
	"amount_cents" bigint NOT NULL,
	"reason" text NOT NULL,
	"status" "adjustment_status" DEFAULT 'proposed' NOT NULL,
	"proposed_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account" "ledger_account" NOT NULL,
	"user_id" uuid,
	"brand_id" uuid,
	"amount_cents" bigint NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_nonzero" CHECK ("ledger_entries"."amount_cents" <> 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"kind" text NOT NULL,
	"conversion_id" uuid,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid,
	"approved_by" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_transactions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"external_sku" text NOT NULL,
	"title" text,
	"quantity" integer NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"list_price_cents" bigint NOT NULL,
	"discount_cents" bigint DEFAULT 0 NOT NULL,
	"returned_quantity" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "order_items_qty" CHECK ("order_items"."quantity" > 0 and "order_items"."returned_quantity" between 0 and "order_items"."quantity")
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "order_status" NOT NULL,
	"status_raw" text NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"integration_id" uuid,
	"external_order_id" text NOT NULL,
	"store_created_at" timestamp with time zone NOT NULL,
	"status" "order_status" NOT NULL,
	"status_raw" text NOT NULL,
	"status_changed_at" timestamp with time zone NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"items_total_cents" bigint NOT NULL,
	"discounts_cents" bigint DEFAULT 0 NOT NULL,
	"shipping_cents" bigint DEFAULT 0 NOT NULL,
	"attribution" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"pix_key_type" text NOT NULL,
	"pix_key_enc" text NOT NULL,
	"pix_key_hint" text NOT NULL,
	"cpf_enc" text NOT NULL,
	"cpf_hash" text NOT NULL,
	"holder_name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_accounts_cpf_hash_unique" UNIQUE("cpf_hash")
);
--> statement-breakpoint
CREATE TABLE "payout_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"status" "payout_status" DEFAULT 'requested' NOT NULL,
	"pix_key_hint" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"paid_by" uuid,
	"paid_at" timestamp with time zone,
	"payment_reference" text,
	"simulated" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "payout_requests_positive" CHECK ("payout_requests"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "reconciliation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"order_id" uuid,
	"conversion_id" uuid,
	"expected_cents" bigint,
	"observed_cents" bigint,
	"status" "reconciliation_status" DEFAULT 'open' NOT NULL,
	"resolution_note" text,
	"resolved_by" uuid,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "reconciliation_items_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_id" uuid,
	"from_staff" boolean DEFAULT false NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"contact_email" text,
	"contact_name" text,
	"category" "ticket_category" NOT NULL,
	"subject" text NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integration_sync_logs" ADD CONSTRAINT "integration_sync_logs_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_invoice_items" ADD CONSTRAINT "brand_invoice_items_invoice_id_brand_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."brand_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_invoice_items" ADD CONSTRAINT "brand_invoice_items_conversion_id_conversions_id_fk" FOREIGN KEY ("conversion_id") REFERENCES "public"."conversions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_invoices" ADD CONSTRAINT "brand_invoices_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_invoices" ADD CONSTRAINT "brand_invoices_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_payments" ADD CONSTRAINT "brand_payments_invoice_id_brand_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."brand_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_payments" ADD CONSTRAINT "brand_payments_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_click_id_clicks_id_fk" FOREIGN KEY ("click_id") REFERENCES "public"."clicks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_look_id_looks_id_fk" FOREIGN KEY ("look_id") REFERENCES "public"."looks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_commission_rule_id_commission_rules_id_fk" FOREIGN KEY ("commission_rule_id") REFERENCES "public"."commission_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_adjustments" ADD CONSTRAINT "ledger_adjustments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_adjustments" ADD CONSTRAINT "ledger_adjustments_conversion_id_conversions_id_fk" FOREIGN KEY ("conversion_id") REFERENCES "public"."conversions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_adjustments" ADD CONSTRAINT "ledger_adjustments_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_adjustments" ADD CONSTRAINT "ledger_adjustments_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_conversion_id_conversions_id_fk" FOREIGN KEY ("conversion_id") REFERENCES "public"."conversions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_conversion_id_conversions_id_fk" FOREIGN KEY ("conversion_id") REFERENCES "public"."conversions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integration_sync_logs_integration_idx" ON "integration_sync_logs" USING btree ("integration_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_kind_brand_idx" ON "integrations" USING btree ("kind","brand_id");--> statement-breakpoint
CREATE INDEX "conversions_user_idx" ON "conversions" USING btree ("user_id","registered_at");--> statement-breakpoint
CREATE INDEX "conversions_state_idx" ON "conversions" USING btree ("state","brand_id","registered_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_user_idx" ON "ledger_entries" USING btree ("user_id","account");--> statement-breakpoint
CREATE INDEX "ledger_entries_brand_idx" ON "ledger_entries" USING btree ("brand_id","account");--> statement-breakpoint
CREATE INDEX "ledger_entries_tx_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_transactions_conversion_idx" ON "ledger_transactions" USING btree ("conversion_id");--> statement-breakpoint
CREATE INDEX "ledger_transactions_occurred_idx" ON "ledger_transactions" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_sku_idx" ON "order_items" USING btree ("order_id","external_sku");--> statement-breakpoint
CREATE INDEX "order_status_history_order_idx" ON "order_status_history" USING btree ("order_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_brand_external_idx" ON "orders" USING btree ("brand_id","external_order_id");--> statement-breakpoint
CREATE INDEX "orders_brand_created_idx" ON "orders" USING btree ("brand_id","store_created_at");--> statement-breakpoint
CREATE INDEX "payout_requests_user_idx" ON "payout_requests" USING btree ("user_id","requested_at");--> statement-breakpoint
CREATE INDEX "payout_requests_status_idx" ON "payout_requests" USING btree ("status","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_requests_one_open_idx" ON "payout_requests" USING btree ("user_id") WHERE "payout_requests"."status" in ('requested', 'approved');--> statement-breakpoint
CREATE INDEX "reconciliation_items_status_idx" ON "reconciliation_items" USING btree ("status","detected_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "support_messages_ticket_idx" ON "support_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_user_idx" ON "support_tickets" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status","updated_at");