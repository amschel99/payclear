import "dotenv/config";

/**
 * Validate that the master encryption key is present and correctly formatted.
 * This runs at import time to fail fast if misconfigured.
 */
function validateMasterKey(): string {
  const key = process.env.PAYCLEAR_MASTER_KEY;
  if (!key) {
    // Allow startup without key for migrations and non-encryption operations,
    // but KeyManager.initialize() will enforce this at runtime.
    return "";
  }
  const cleaned = key.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(cleaned)) {
    throw new Error(
      "PAYCLEAR_MASTER_KEY must be exactly 64 hex characters (32 bytes). " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return cleaned;
}

export const config = {
  port: parseInt(process.env.API_PORT || "3000", 10),
  host: process.env.API_HOST || "0.0.0.0",

  database: {
    url: process.env.DATABASE_URL || "postgresql://payclear:payclear@localhost:5432/payclear",
  },

  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },

  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || "http://localhost:8899",
    programId: process.env.PROGRAM_ID || "",
    walletPath: process.env.ANCHOR_WALLET || "~/.config/solana/id.json",
  },

  webhook: {
    signingSecret: process.env.WEBHOOK_SIGNING_SECRET || "dev-secret",
    maxRetries: 5,
  },

  civic: {
    /** Default Civic Gatekeeper Network public key (Civic Pass Uniqueness / KYC network) */
    defaultGatekeeperNetwork:
      process.env.CIVIC_DEFAULT_GATEKEEPER_NETWORK ||
      "ignREusXmGrscGNUesoU9mxfds9AiYqSGGY9CPQZ1Fo",
    /** Civic Gateway program ID */
    gatewayProgramId:
      process.env.CIVIC_GATEWAY_PROGRAM_ID ||
      "gatem74V238djXdzWnJf94Wo1DcnuGkfijbf3AuBhfs",
  },

  sumsub: {
    appToken: process.env.SUMSUB_APP_TOKEN || "",
    secretKey: process.env.SUMSUB_SECRET_KEY || "",
    webhookSecret: process.env.SUMSUB_WEBHOOK_SECRET || "",
    baseUrl: process.env.SUMSUB_BASE_URL || "https://api.sumsub.com",
    defaultLevel: process.env.SUMSUB_DEFAULT_LEVEL || "basic-kyc-level",
  },

  sas: {
    programId: process.env.SAS_PROGRAM_ID || "",
  },

  encryption: {
    /** Hex-encoded 32-byte AES-256 master key for PII field encryption */
    masterKey: validateMasterKey(),
  },

  chainalysis: {
    apiKey: process.env.CHAINALYSIS_API_KEY || "",
    baseUrl:
      process.env.CHAINALYSIS_BASE_URL ||
      "https://api.chainalysis.com/api/kyt/v2",
    webhookSecret: process.env.CHAINALYSIS_WEBHOOK_SECRET || "",
    autoRejectThreshold: parseInt(
      process.env.CHAINALYSIS_AUTO_REJECT_THRESHOLD || "70"
    ),
    autoRevokeThreshold: parseInt(
      process.env.CHAINALYSIS_AUTO_REVOKE_THRESHOLD || "85"
    ),
  },

  oracle: {
    privateKey: process.env.ORACLE_PRIVATE_KEY || "",
  },

  reclaim: {
    appId: process.env.RECLAIM_APP_ID || "",
    appSecret: process.env.RECLAIM_APP_SECRET || "",
    trustedAttestors: (process.env.RECLAIM_TRUSTED_ATTESTORS || "")
      .split(",")
      .filter(Boolean),
    proofTtlSeconds: parseInt(process.env.RECLAIM_PROOF_TTL || "86400"), // 24 hours
  },
} as const;
