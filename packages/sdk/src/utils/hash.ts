import { createHash } from "crypto";

/**
 * Hash data using SHA-256, returning a 32-byte Buffer.
 * Used for KYC data hashes and Travel Rule data hashes stored on-chain.
 */
export function sha256(data: string | Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

/**
 * Hash a Travel Rule payload for on-chain storage.
 * The full payload is stored off-chain; only the hash goes on-chain.
 */
export function hashTravelRuleData(data: {
  name: string;
  account: string;
  [key: string]: unknown;
}): Buffer {
  const normalized = JSON.stringify(data, Object.keys(data).sort());
  return sha256(normalized);
}

/**
 * Hash KYC data for on-chain attestation.
 */
export function hashKycData(data: Record<string, unknown>): Buffer {
  const normalized = JSON.stringify(data, Object.keys(data).sort());
  return sha256(normalized);
}

/**
 * Convert a string to a 32-byte institution ID via SHA-256.
 */
export function toInstitutionId(name: string): Buffer {
  return sha256(name);
}

/**
 * Generate a random 32-byte nonce for transfers.
 */
export function generateNonce(): Buffer {
  const { randomBytes } = require("crypto");
  return randomBytes(32);
}
