import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  smallint,
  bigint,
  jsonb,
  bigserial,
  date,
  char,
  index,
  unique,
} from "drizzle-orm/pg-core";

// ─── Institutions ────────────────────────────────────────────

export const institutions = pgTable("institutions", {
  id: uuid("id").primaryKey().defaultRandom(),
  institutionId: text("institution_id").notNull().unique(), // hex-encoded 32 bytes
  name: text("name").notNull(),
  vaspCode: text("vasp_code").notNull(),
  jurisdiction: char("jurisdiction", { length: 2 }).notNull(),
  onchainPubkey: text("onchain_pubkey").notNull().unique(),
  authorityPubkey: text("authority_pubkey").notNull(),
  apiKeyHash: text("api_key_hash").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Entities (KYC-verified wallets) ─────────────────────────

export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id),
    walletAddress: text("wallet_address").notNull(),
    kycLevel: smallint("kyc_level").notNull().default(0),
    riskScore: smallint("risk_score").notNull().default(0),
    status: smallint("status").notNull().default(0),
    fullName: text("full_name"),
    dateOfBirth: date("date_of_birth"),
    nationality: char("nationality", { length: 2 }),
    governmentIdType: text("government_id_type"),
    governmentIdHash: text("government_id_hash"),
    addressLine1: text("address_line1"),
    addressCity: text("address_city"),
    addressCountry: char("address_country", { length: 2 }),
    onchainPubkey: text("onchain_pubkey"),
    kycHash: text("kyc_hash"), // hex-encoded
    zkProofId: uuid("zk_proof_id"),
    kycProofSource: text("kyc_proof_source"), // 'direct', 'sumsub', 'reclaim'
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.institutionId, table.walletAddress)]
);

// ─── ZK Proofs (Reclaim Protocol) ─────────────────────────────

export const zkProofs = pgTable(
  "zk_proofs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id),
    entityId: uuid("entity_id"),
    walletAddress: text("wallet_address").notNull(),
    proofIdentifier: text("proof_identifier").notNull().unique(),
    provider: text("provider").notNull(),
    kycLevel: smallint("kyc_level").notNull(),
    reclaimProofData: jsonb("reclaim_proof_data").notNull(),
    attestorId: text("attestor_id").notNull(),
    status: text("status").notNull().default("verified"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    onchainAddress: text("onchain_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_zk_proofs_wallet").on(table.walletAddress),
    index("idx_zk_proofs_institution").on(table.institutionId),
    index("idx_zk_proofs_identifier").on(table.proofIdentifier),
  ]
);

// ─── Compliance Policies ─────────────────────────────────────

export const compliancePolicies = pgTable(
  "compliance_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id),
    policyId: text("policy_id").notNull(), // hex-encoded
    name: text("name").notNull(),
    minKycLevel: smallint("min_kyc_level").notNull().default(1),
    maxRiskScore: smallint("max_risk_score").notNull().default(70),
    travelRuleThreshold: bigint("travel_rule_threshold", { mode: "bigint" })
      .notNull()
      .default(1000000000n), // 1000 USDC
    requireBothAttested: boolean("require_both_attested").notNull().default(true),
    maxTransferAmount: bigint("max_transfer_amount", { mode: "bigint" })
      .notNull()
      .default(0n),
    dailyLimit: bigint("daily_limit", { mode: "bigint" }).notNull().default(0n),
    allowedJurisdictions: text("allowed_jurisdictions").array(),
    blockedJurisdictions: text("blocked_jurisdictions").array(),
    active: boolean("active").notNull().default(true),
    onchainPubkey: text("onchain_pubkey"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.institutionId, table.policyId)]
);

// ─── Travel Rule Data ────────────────────────────────────────

export const travelRuleData = pgTable("travel_rule_data", {
  id: uuid("id").primaryKey().defaultRandom(),
  nonce: text("nonce").notNull().unique(), // hex-encoded
  originatorInstitutionId: uuid("originator_institution_id")
    .notNull()
    .references(() => institutions.id),
  beneficiaryInstitutionId: uuid("beneficiary_institution_id").references(
    () => institutions.id
  ),
  // IVMS101 originator fields
  originatorName: text("originator_name").notNull(),
  originatorAccount: text("originator_account").notNull(),
  originatorAddressStreet: text("originator_address_street"),
  originatorAddressCity: text("originator_address_city"),
  originatorAddressCountry: char("originator_address_country", { length: 2 }),
  originatorNationalId: text("originator_national_id"),
  originatorDob: date("originator_dob"),
  originatorPlaceOfBirth: text("originator_place_of_birth"),
  // IVMS101 beneficiary fields
  beneficiaryName: text("beneficiary_name").notNull(),
  beneficiaryAccount: text("beneficiary_account").notNull(),
  beneficiaryAddressStreet: text("beneficiary_address_street"),
  beneficiaryAddressCity: text("beneficiary_address_city"),
  beneficiaryAddressCountry: char("beneficiary_address_country", { length: 2 }),
  beneficiaryInstitutionName: text("beneficiary_institution_name"),
  // Hashes matching on-chain
  originatorDataHash: text("originator_data_hash").notNull(),
  beneficiaryDataHash: text("beneficiary_data_hash").notNull(),
  amount: bigint("amount", { mode: "bigint" }).notNull(),
  tokenMint: text("token_mint").notNull(),
  status: smallint("status").notNull().default(0),
  onchainPubkey: text("onchain_pubkey"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Transfers ───────────────────────────────────────────────

export const transfers = pgTable(
  "transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nonce: text("nonce").notNull().unique(), // hex-encoded
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id),
    senderWallet: text("sender_wallet").notNull(),
    receiverWallet: text("receiver_wallet").notNull(),
    mint: text("mint").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    status: smallint("status").notNull().default(0),
    txSignature: text("tx_signature"),
    compliancePolicyId: uuid("compliance_policy_id").references(
      () => compliancePolicies.id
    ),
    senderRiskScore: smallint("sender_risk_score"),
    receiverRiskScore: smallint("receiver_risk_score"),
    travelRuleId: uuid("travel_rule_id").references(() => travelRuleData.id),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_transfers_institution").on(table.institutionId),
    index("idx_transfers_sender").on(table.senderWallet),
    index("idx_transfers_receiver").on(table.receiverWallet),
    index("idx_transfers_created").on(table.createdAt),
  ]
);

// ─── Audit Log ───────────────────────────────────────────────

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    institutionId: uuid("institution_id").references(() => institutions.id),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    actor: text("actor").notNull(),
    details: jsonb("details"),
    txSignature: text("tx_signature"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_audit_institution").on(table.institutionId),
    index("idx_audit_event_type").on(table.eventType),
    index("idx_audit_created").on(table.createdAt),
  ]
);

// ─── Webhooks ────────────────────────────────────────────────

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  institutionId: uuid("institution_id")
    .notNull()
    .references(() => institutions.id),
  url: text("url").notNull(),
  events: text("events").array().notNull(),
  secret: text("secret").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  webhookId: uuid("webhook_id")
    .notNull()
    .references(() => webhooks.id),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: smallint("status").notNull().default(0),
  attempts: smallint("attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  responseCode: smallint("response_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
