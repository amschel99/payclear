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
  requireCivicPass: boolean;
  gatekeeperNetwork: PublicKey;
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

export interface CivicGatewayToken {
  /** Feature flags byte */
  features: number;
  /** Token state: 0=Active, 1=Revoked, 2=Frozen */
  state: number;
  /** The gatekeeper network this token belongs to */
  gatekeeperNetwork: PublicKey;
  /** The issuing gatekeeper */
  issuingGatekeeper: PublicKey;
  /** Expiry timestamp (0 = no expiry) */
  expireTime: bigint;
}

// ─── Selective Disclosure Types ──────────────────────────────────

/**
 * Serializable representation of a Merkle proof for transport over the wire.
 * Buffer values are hex-encoded strings for JSON compatibility.
 */
export interface SerializedMerkleProof {
  /** Hex-encoded Merkle root. */
  root: string;
  /** Individual field proofs. */
  items: SerializedMerkleProofItem[];
}

export interface SerializedMerkleProofItem {
  fieldName: string;
  fieldValue: string;
  /** Hex-encoded leaf hash. */
  leafHash: string;
  siblings: SerializedProofSibling[];
}

export interface SerializedProofSibling {
  /** Hex-encoded sibling hash. */
  hash: string;
  position: "left" | "right";
}

/**
 * Response returned by the disclosure proof API endpoint.
 */
export interface DisclosureProofResponse {
  walletAddress: string;
  /** Hex-encoded Merkle root matching on-chain kycHash. */
  merkleRoot: string;
  /** The disclosed field values. */
  disclosedFields: Record<string, string>;
  /** The serialized Merkle proof. */
  proof: SerializedMerkleProof;
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

export const CivicGatewayState = {
  Active: 0,
  Revoked: 1,
  Frozen: 2,
} as const;
