import "dotenv/config";

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
} as const;
