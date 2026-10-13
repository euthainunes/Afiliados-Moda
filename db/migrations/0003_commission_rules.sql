CREATE TYPE "public"."commission_base" AS ENUM('item_net_paid', 'item_list_price', 'order_total_excl_shipping');--> statement-breakpoint
CREATE TYPE "public"."eligibility_start" AS ENUM('order_created', 'order_invoiced', 'order_delivered');--> statement-breakpoint
CREATE TYPE "public"."commission_rule_status" AS ENUM('draft', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "commission_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "commission_rule_status" DEFAULT 'draft' NOT NULL,
	"base_type" "commission_base" NOT NULL,
	"commission_bps" integer NOT NULL,
	"user_share_bps" integer NOT NULL,
	"platform_share_bps" integer NOT NULL,
	"attribution_window_days" integer NOT NULL,
	"eligibility_policy" jsonb NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"contract_reference" text,
	"notes" text,
	"proposed_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_rules_bps_range" CHECK ("commission_rules"."commission_bps" between 0 and 10000 and "commission_rules"."user_share_bps" >= 0 and "commission_rules"."platform_share_bps" >= 0),
	CONSTRAINT "commission_rules_split_sum" CHECK ("commission_rules"."user_share_bps" + "commission_rules"."platform_share_bps" = "commission_rules"."commission_bps"),
	CONSTRAINT "commission_rules_window" CHECK ("commission_rules"."attribution_window_days" between 1 and 90),
	CONSTRAINT "commission_rules_validity" CHECK ("commission_rules"."valid_to" is null or "commission_rules"."valid_to" > "commission_rules"."valid_from"),
	CONSTRAINT "commission_rules_approved_has_contract" CHECK ("commission_rules"."status" <> 'approved' or coalesce(length(trim("commission_rules"."contract_reference")), 0) > 0)
);
--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_rules_campaign_version_idx" ON "commission_rules" USING btree ("campaign_id","version");--> statement-breakpoint
CREATE INDEX "commission_rules_campaign_status_idx" ON "commission_rules" USING btree ("campaign_id","status","valid_from");