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

  encryption: {
    /** Hex-encoded 32-byte AES-256 master key for PII field encryption */
    masterKey: validateMasterKey(),
  },
} as const;
