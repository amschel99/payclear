import { PublicKey } from "@solana/web3.js";

export interface Registry {
  authority: PublicKey;
  institutionCount: bigint;
  attestationCount: bigint;
  transferCount: bigint;
  paused: boolean;
  bump: number;
}

export interface Institution {
  institutionId: Uint8Array; // 32 bytes
  authority: PublicKey;
  vaspCode: Uint8Array; // 16 bytes
  jurisdiction: Uint8Array; // 2 bytes
  active: boolean;
  attestationCount: bigint;
  defaultPolicy: PublicKey;
  createdAt: bigint;
  bump: number;
}

export interface KycAttestation {
  institution: PublicKey;
  wallet: PublicKey;
  kycHash: Uint8Array; // 32 bytes
  kycLevel: number;
  riskScore: number;
  status: number;
  expiresAt: bigint;
  createdAt: bigint;
  updatedAt: bigint;
  bump: number;
}

export interface CompliancePolicy {
  institution: PublicKey;
  policyId: Uint8Array; // 32 bytes
  minKycLevel: number;
  maxRiskScore: number;
  travelRuleThreshold: bigint;
  requireBothAttested: boolean;
  allowedJurisdictions: Uint8Array; // 64 bytes
  blockedJurisdictions: Uint8Array; // 64 bytes
  maxTransferAmount: bigint;
  dailyLimit: bigint;
  active: boolean;
  bump: number;
}

export interface TravelRuleRecord {
  transferNonce: Uint8Array; // 32 bytes
  originatorInstitution: PublicKey;
  beneficiaryInstitution: PublicKey;
  originatorWallet: PublicKey;
  beneficiaryWallet: PublicKey;
  amount: bigint;
  tokenMint: PublicKey;
  originatorDataHash: Uint8Array; // 32 bytes
  beneficiaryDataHash: Uint8Array; // 32 bytes
  status: number;
  createdAt: bigint;
  bump: number;
}

export interface TransferRecord {
  nonce: Uint8Array; // 32 bytes
  sender: PublicKey;
  receiver: PublicKey;
  mint: PublicKey;
  amount: bigint;
  compliancePolicy: PublicKey;
  travelRuleRecord: PublicKey;
  senderRiskScore: number;
  receiverRiskScore: number;
  status: number;
  timestamp: bigint;
  bump: number;
}

export interface ZkProofRecord {
  institution: PublicKey;
  wallet: PublicKey;
  proofIdentifier: Uint8Array; // 32 bytes (SHA-256 of Reclaim proof identifier)
  provider: Uint8Array; // 32 bytes (padded provider name)
  kycLevel: number;
  verifiedAt: bigint;
  expiresAt: bigint;
  attestor: PublicKey;
  status: number;
  createdAt: bigint;
  bump: number;
}

// Status enums
export const KycStatus = {
  Pending: 0,
  Active: 1,
  Suspended: 2,
  Revoked: 3,
} as const;

export const KycLevel = {
  None: 0,
  Basic: 1,
  Enhanced: 2,
  Institutional: 3,
} as const;

export const TravelRuleStatus = {
  Pending: 0,
  Approved: 1,
  Rejected: 2,
  Settled: 3,
} as const;

export const TransferStatus = {
  Pending: 0,
  Completed: 1,
  Failed: 2,
  Flagged: 3,
} as const;

export const ZkProofStatus = {
  Pending: 0,
  Verified: 1,
  Expired: 2,
  Revoked: 3,
} as const;
