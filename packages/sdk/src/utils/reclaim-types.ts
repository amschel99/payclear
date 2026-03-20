// ─── Reclaim Protocol Data Structures ─────────────────────────

/**
 * Core Reclaim Protocol proof structure.
 * Represents a zero-knowledge proof generated via zkTLS attestation.
 */
export interface ReclaimProof {
  /** Unique proof identifier (hash of claim + attestor signatures) */
  identifier: string;
  /** The claim data that was proven */
  claimData: ClaimData;
  /** Attestor signatures over the claim */
  signatures: string[];
  /** Witness nodes that participated in attestation */
  witnesses: WitnessData[];
  /** Key-value pairs extracted from the proven data */
  extractedParameterValues: Record<string, string>;
}

/**
 * Claim data within a Reclaim proof.
 * Describes what was proven and by which provider.
 */
export interface ClaimData {
  /** Provider identifier, e.g., "sumsub-kyc-verification" */
  provider: string;
  /** JSON string of claim parameters */
  parameters: string;
  /** Additional context (e.g., wallet binding) */
  context: string;
  /** Unique claim identifier */
  identifier: string;
  /** Reclaim epoch in which the proof was created */
  epoch: number;
  /** Unix timestamp (seconds) of proof creation */
  timestampS: number;
}

/**
 * Witness (attestor node) metadata.
 */
export interface WitnessData {
  /** Witness identifier (public key or DID) */
  id: string;
  /** Witness endpoint URL */
  url: string;
}

// ─── PayClear-Specific Claim Schemas ──────────────────────────

/**
 * Normalized KYC claim that PayClear accepts from Reclaim proofs.
 * Extracted from the proof's `extractedParameterValues` after validation.
 */
export interface PayClearKycClaim {
  /** KYC provider name: "sumsub", "jumio", "onfido", etc. */
  kycProvider: string;
  /** Provider-specific KYC tier: "basic", "enhanced", "institutional" */
  kycLevel: string;
  /** Must be "approved" for PayClear to accept the claim */
  verificationStatus: string;
  /** ISO 3166-1 alpha-2 country code of the verified jurisdiction */
  jurisdiction: string;
  /** ISO-8601 timestamp of when verification completed */
  verifiedAt: string;
  /** Solana wallet address this proof is bound to */
  walletAddress: string;
}

/**
 * Supported KYC providers and their level mappings.
 */
export const ACCEPTED_KYC_PROVIDERS: Record<string, Record<string, number>> = {
  sumsub: {
    "basic-kyc-level": 1,
    "basic": 1,
    "advanced-kyc-level": 2,
    "enhanced": 2,
    "full-verification": 3,
    "institutional": 3,
  },
  jumio: {
    "id_verification": 1,
    "basic": 1,
    "id_and_address": 2,
    "enhanced": 2,
    "full_aml": 3,
    "institutional": 3,
  },
  onfido: {
    "document_check": 1,
    "basic": 1,
    "document_and_facial": 2,
    "enhanced": 2,
    "full_check": 3,
    "institutional": 3,
  },
} as const;

/**
 * Result of proof verification.
 */
export interface VerificationResult {
  valid: boolean;
  kycLevel: number;
  kycClaim: PayClearKycClaim | null;
  error?: string;
}

/**
 * Proof request that a user/institution must fulfill.
 */
export interface ProofRequest {
  requestId: string;
  requestUrl: string;
  qrCodeData: string;
  walletAddress: string;
  requiredKycLevel: number;
  acceptedProviders: string[];
  expiresAt: string;
}

/**
 * ZK proof status values used across the system.
 */
export const ZkProofStatus = {
  Pending: 0,
  Verified: 1,
  Expired: 2,
  Revoked: 3,
} as const;

export type ZkProofStatusValue = (typeof ZkProofStatus)[keyof typeof ZkProofStatus];
