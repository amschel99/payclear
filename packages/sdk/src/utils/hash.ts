import { createHash } from "crypto";
import {
  canonicalize,
  canonicalHash as _canonicalHash,
  hashKycCanonical,
} from "./canonical.js";

/**
 * Hash data using SHA-256, returning a 32-byte Buffer.
 * Used for KYC data hashes and Travel Rule data hashes stored on-chain.
 */
export function sha256(data: string | Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

/**
 * Hash a Travel Rule payload for on-chain storage.
 *
 * Uses RFC 8785 canonical JSON serialization to ensure deterministic
 * output regardless of key insertion order.
 *
 * The full payload is stored off-chain; only the hash goes on-chain.
 */
export function hashTravelRuleData(data: {
  name: string;
  account: string;
  [key: string]: unknown;
}): Buffer {
  return _canonicalHash(data);
}

/**
 * Hash KYC data for on-chain attestation.
 *
 * Uses RFC 8785 canonical JSON serialization with a versioned envelope
 * (`{"v":1,"data":{...}}`) so that:
 *   - Key ordering is deterministic (alphabetical).
 *   - Only the defined KYC field set participates in the hash.
 *   - Future field-set changes produce distinct digests via the version tag.
 *
 * The returned 32-byte Buffer can be stored directly in the on-chain
 * `KycAttestation.kyc_hash` field (`[u8; 32]`).
 *
 * @param data - An object containing some or all KYC fields.
 * @returns A 32-byte SHA-256 digest.
 */
export function hashKycData(data: Record<string, unknown>): Buffer {
  return hashKycCanonical(data);
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
