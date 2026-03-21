import { createHash } from "crypto";
import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "../config.js";
import type { KytScoreInput } from "../schemas/compliance.schema.js";

// ─── Types ──────────────────────────────────────────────────

interface RiskFactor {
  level: string;
  detail: string;
}

export interface KytResult {
  score: number;
  passed: boolean;
  factors: {
    amountRisk: RiskFactor;
    walletAge: RiskFactor;
    volumeRisk: RiskFactor;
    counterpartyRisk: RiskFactor;
  };
}

// ─── Risk Scoring Functions ─────────────────────────────────

function scoreAmount(amount: number): RiskFactor {
  if (amount < 1_000) {
    return { level: "low", detail: `Amount $${amount} under $1,000 threshold` };
  }
  if (amount < 10_000) {
    return { level: "medium", detail: `Amount $${amount} in $1,000–$10,000 range` };
  }
  if (amount < 50_000) {
    return { level: "high", detail: `Amount $${amount} in $10,000–$50,000 range` };
  }
  return { level: "critical", detail: `Amount $${amount} exceeds $50,000 threshold` };
}

function getAmountPoints(amount: number): number {
  if (amount < 1_000) return 0;
  if (amount < 10_000) return 10;
  if (amount < 50_000) return 25;
  return 40;
}

async function checkWalletExists(walletAddress: string): Promise<boolean | null> {
  try {
    const connection = new Connection(config.solana.rpcUrl, "confirmed");
    const pubkey = new PublicKey(walletAddress);
    const accountInfo = await connection.getAccountInfo(pubkey);
    return accountInfo !== null;
  } catch {
    return null; // RPC error — indeterminate
  }
}

async function scoreWalletAge(walletAddress: string): Promise<{ points: number; factor: RiskFactor }> {
  const exists = await checkWalletExists(walletAddress);

  if (exists === null) {
    // RPC error — use default moderate risk
    return {
      points: 10,
      factor: { level: "medium", detail: "Wallet age check inconclusive (RPC unavailable)" },
    };
  }
  if (exists) {
    return {
      points: 0,
      factor: { level: "low", detail: "Wallet has on-chain history" },
    };
  }
  return {
    points: 15,
    factor: { level: "high", detail: "Wallet is new or has no on-chain history" },
  };
}

/**
 * Deterministic volume risk based on wallet address hash.
 * In production, this would query historical transaction volume.
 */
function scoreVolumeRisk(walletAddress: string): { points: number; factor: RiskFactor } {
  const hash = createHash("sha256").update(walletAddress).digest();
  // Use first 2 bytes to generate a deterministic score 0–20
  const points = (hash.readUInt16BE(0) % 21);

  let level: string;
  if (points <= 5) level = "low";
  else if (points <= 12) level = "medium";
  else level = "high";

  return {
    points,
    factor: { level, detail: `Historical volume risk score: ${points}/20` },
  };
}

async function scoreCounterpartyRisk(
  receiverWallet: string
): Promise<{ points: number; factor: RiskFactor }> {
  const exists = await checkWalletExists(receiverWallet);

  if (exists === null) {
    return {
      points: 12,
      factor: { level: "medium", detail: "Counterparty check inconclusive (RPC unavailable)" },
    };
  }
  if (exists) {
    return {
      points: 0,
      factor: { level: "low", detail: "Counterparty wallet has on-chain history" },
    };
  }
  return {
    points: 25,
    factor: { level: "critical", detail: "Counterparty wallet is new or unknown" },
  };
}

// ─── Public API ─────────────────────────────────────────────

export async function scoreTransaction(input: KytScoreInput): Promise<KytResult> {
  const amountPoints = getAmountPoints(input.amount);
  const amountRisk = scoreAmount(input.amount);

  const [walletAgeResult, counterpartyResult] = await Promise.all([
    scoreWalletAge(input.senderWallet),
    scoreCounterpartyRisk(input.receiverWallet),
  ]);

  const volumeResult = scoreVolumeRisk(input.senderWallet);

  const rawScore =
    amountPoints +
    walletAgeResult.points +
    volumeResult.points +
    counterpartyResult.points;

  const score = Math.min(rawScore, 100);

  return {
    score,
    passed: score <= 70,
    factors: {
      amountRisk,
      walletAge: walletAgeResult.factor,
      volumeRisk: volumeResult.factor,
      counterpartyRisk: counterpartyResult.factor,
    },
  };
}
