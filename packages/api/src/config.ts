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
} as const;
