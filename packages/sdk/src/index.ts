export { PayClearClient } from "./client.js";
export type {
  PayClearClientConfig,
  RegisterInstitutionParams,
  CreateAttestationParams,
  PolicyParams,
  TransferParams,
  TravelRuleParams,
  TransferResult,
  RecordZkProofParams,
} from "./client.js";

// PDA derivation helpers
export {
  deriveRegistryPDA,
  deriveInstitutionPDA,
  deriveKycAttestationPDA,
  derivePolicyPDA,
  deriveTravelRulePDA,
  deriveTransferPDA,
  deriveExtraAccountMetaListPDA,
  deriveZkProofPDA,
} from "./accounts/pda.js";

// Account types
export type {
  Registry,
  Institution,
  KycAttestation,
  CompliancePolicy,
  TravelRuleRecord,
  TransferRecord,
  ZkProofRecord,
} from "./accounts/types.js";

export {
  KycStatus,
  KycLevel,
  TravelRuleStatus,
  TransferStatus,
  ZkProofStatus,
} from "./accounts/types.js";

// Utilities
export {
  sha256,
  hashTravelRuleData,
  hashKycData,
  toInstitutionId,
  generateNonce,
} from "./utils/hash.js";

// Reclaim Protocol types
export type {
  ReclaimProof,
  ClaimData,
  WitnessData,
  PayClearKycClaim,
  VerificationResult,
  ProofRequest,
} from "./utils/reclaim-types.js";

export {
  ACCEPTED_KYC_PROVIDERS,
  ZkProofStatus as ReclaimZkProofStatus,
} from "./utils/reclaim-types.js";
