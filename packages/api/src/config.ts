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
} as const;
