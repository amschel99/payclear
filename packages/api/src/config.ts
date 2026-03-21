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

  reclaim: {
    appId: process.env.RECLAIM_APP_ID || "",
    appSecret: process.env.RECLAIM_APP_SECRET || "",
    trustedAttestors: (process.env.RECLAIM_TRUSTED_ATTESTORS || "")
      .split(",")
      .filter(Boolean),
    proofTtlSeconds: parseInt(process.env.RECLAIM_PROOF_TTL || "86400"), // 24 hours
  },
} as const;
