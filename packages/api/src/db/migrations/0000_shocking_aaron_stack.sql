CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"institution_id" uuid,
	"event_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"actor" text NOT NULL,
	"details" jsonb,
	"tx_signature" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compliance_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"policy_id" text NOT NULL,
	"name" text NOT NULL,
	"min_kyc_level" smallint DEFAULT 1 NOT NULL,
	"max_risk_score" smallint DEFAULT 70 NOT NULL,
	"travel_rule_threshold" bigint DEFAULT 1000000000 NOT NULL,
	"require_both_attested" boolean DEFAULT true NOT NULL,
	"max_transfer_amount" bigint DEFAULT 0 NOT NULL,
	"daily_limit" bigint DEFAULT 0 NOT NULL,
	"allowed_jurisdictions" text[],
	"blocked_jurisdictions" text[],
	"active" boolean DEFAULT true NOT NULL,
	"require_civic_pass" boolean DEFAULT false NOT NULL,
	"gatekeeper_network" text,
	"onchain_pubkey" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_policies_institution_id_policy_id_unique" UNIQUE("institution_id","policy_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"wallet_address" text NOT NULL,
	"kyc_level" smallint DEFAULT 0 NOT NULL,
	"risk_score" smallint DEFAULT 0 NOT NULL,
	"status" smallint DEFAULT 0 NOT NULL,
	"full_name" text,
	"date_of_birth" text,
	"nationality" text,
	"government_id_type" text,
	"government_id_hash" text,
	"address_line1" text,
	"address_city" text,
	"address_country" text,
	"onchain_pubkey" text,
	"kyc_hash" text,
	"merkle_leaves" jsonb,
	"encryption_version" integer DEFAULT 1 NOT NULL,
	"civic_pass_address" text,
	"sumsub_applicant_id" text,
	"sumsub_review_status" text,
	"sumsub_verification_level" text,
	"sas_attestation_address" text,
	"kyc_provider" text DEFAULT 'self',
	"zk_proof_id" uuid,
	"kyc_proof_source" text,
	"expires_at" timestamp with time zone,
	"original_institution_id" uuid,
	"original_entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entities_institution_id_wallet_address_unique" UNIQUE("institution_id","wallet_address")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" text NOT NULL,
	"name" text NOT NULL,
	"vasp_code" text NOT NULL,
	"jurisdiction" char(2) NOT NULL,
	"onchain_pubkey" text NOT NULL,
	"authority_pubkey" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"encrypted_dek" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutions_institution_id_unique" UNIQUE("institution_id"),
	CONSTRAINT "institutions_onchain_pubkey_unique" UNIQUE("onchain_pubkey")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "screening_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid,
	"entity_id" uuid,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"rating" text NOT NULL,
	"risk_score" smallint NOT NULL,
	"raw_score" text,
	"exposures" jsonb,
	"screened_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nonce" text NOT NULL,
	"institution_id" uuid NOT NULL,
	"sender_wallet" text NOT NULL,
	"receiver_wallet" text NOT NULL,
	"mint" text NOT NULL,
	"amount" bigint NOT NULL,
	"status" smallint DEFAULT 0 NOT NULL,
	"tx_signature" text,
	"compliance_policy_id" uuid,
	"sender_risk_score" smallint,
	"receiver_risk_score" smallint,
	"travel_rule_id" uuid,
	"screening_status" text,
	"screening_id" uuid,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "transfers_nonce_unique" UNIQUE("nonce")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "travel_rule_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nonce" text NOT NULL,
	"originator_institution_id" uuid NOT NULL,
	"beneficiary_institution_id" uuid,
	"originator_name" text NOT NULL,
	"originator_account" text NOT NULL,
	"originator_address_street" text,
	"originator_address_city" text,
	"originator_address_country" char(2),
	"originator_national_id" text,
	"originator_dob" date,
	"originator_place_of_birth" text,
	"beneficiary_name" text NOT NULL,
	"beneficiary_account" text NOT NULL,
	"beneficiary_address_street" text,
	"beneficiary_address_city" text,
	"beneficiary_address_country" char(2),
	"beneficiary_institution_name" text,
	"originator_data_hash" text NOT NULL,
	"beneficiary_data_hash" text NOT NULL,
	"amount" bigint NOT NULL,
	"token_mint" text NOT NULL,
	"status" smallint DEFAULT 0 NOT NULL,
	"onchain_pubkey" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "travel_rule_data_nonce_unique" UNIQUE("nonce")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trust_network" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"trusted_institution_id" uuid NOT NULL,
	"min_kyc_level" smallint DEFAULT 1 NOT NULL,
	"require_same_jurisdiction" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trust_network_institution_id_trusted_institution_id_unique" UNIQUE("institution_id","trusted_institution_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" smallint DEFAULT 0 NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"response_code" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"url" text NOT NULL,
	"events" text[] NOT NULL,
	"secret" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "zk_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"entity_id" uuid,
	"wallet_address" text NOT NULL,
	"proof_identifier" text NOT NULL,
	"provider" text NOT NULL,
	"kyc_level" smallint NOT NULL,
	"reclaim_proof_data" jsonb NOT NULL,
	"attestor_id" text NOT NULL,
	"status" text DEFAULT 'verified' NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"onchain_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zk_proofs_proof_identifier_unique" UNIQUE("proof_identifier")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compliance_policies" ADD CONSTRAINT "compliance_policies_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entities" ADD CONSTRAINT "entities_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entities" ADD CONSTRAINT "entities_original_institution_id_institutions_id_fk" FOREIGN KEY ("original_institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfers" ADD CONSTRAINT "transfers_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfers" ADD CONSTRAINT "transfers_compliance_policy_id_compliance_policies_id_fk" FOREIGN KEY ("compliance_policy_id") REFERENCES "public"."compliance_policies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transfers" ADD CONSTRAINT "transfers_travel_rule_id_travel_rule_data_id_fk" FOREIGN KEY ("travel_rule_id") REFERENCES "public"."travel_rule_data"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "travel_rule_data" ADD CONSTRAINT "travel_rule_data_originator_institution_id_institutions_id_fk" FOREIGN KEY ("originator_institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "travel_rule_data" ADD CONSTRAINT "travel_rule_data_beneficiary_institution_id_institutions_id_fk" FOREIGN KEY ("beneficiary_institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trust_network" ADD CONSTRAINT "trust_network_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trust_network" ADD CONSTRAINT "trust_network_trusted_institution_id_institutions_id_fk" FOREIGN KEY ("trusted_institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "zk_proofs" ADD CONSTRAINT "zk_proofs_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_institution" ON "audit_log" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_event_type" ON "audit_log" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_created" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_screening_transfer" ON "screening_results" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_screening_entity" ON "screening_results" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_screening_external" ON "screening_results" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transfers_institution" ON "transfers" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transfers_sender" ON "transfers" USING btree ("sender_wallet");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transfers_receiver" ON "transfers" USING btree ("receiver_wallet");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transfers_created" ON "transfers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transfers_screening" ON "transfers" USING btree ("screening_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trust_network_institution" ON "trust_network" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_zk_proofs_wallet" ON "zk_proofs" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_zk_proofs_institution" ON "zk_proofs" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_zk_proofs_identifier" ON "zk_proofs" USING btree ("proof_identifier");