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

// Program IDL
export { default as payclearIdl } from "./idl/payclear.json";

// PDA derivation helpers
export {
  deriveRegistryPDA,
  deriveInstitutionPDA,
  deriveKycAttestationPDA,
  derivePolicyPDA,
  deriveTravelRulePDA,
  deriveTransferPDA,
  deriveExtraAccountMetaListPDA,
  deriveCivicGatewayTokenPDA,
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
  CivicGatewayToken,
  SerializedMerkleProof,
  SerializedMerkleProofItem,
  SerializedProofSibling,
  DisclosureProofResponse,
  ZkProofRecord,
} from "./accounts/types.js";

export {
  KycStatus,
  KycLevel,
  TravelRuleStatus,
  TransferStatus,
  CivicGatewayState,
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

// Merkle tree for selective disclosure
export {
  buildKycMerkleTree,
  getMerkleRoot,
  generateProof,
  verifyProof,
  hashLeaf,
} from "./utils/merkle.js";

export type {
  KycFieldMap,
  MerkleTree,
  MerkleNode,
  MerkleProof,
  MerkleProofItem,
  ProofSibling,
} from "./utils/merkle.js";

// KYC field schema
export {
  KYC_FIELD_CATEGORY,
  KYC_FIELD_DEFINITIONS,
  VALID_KYC_FIELD_NAMES,
  SORTED_KYC_FIELD_NAMES,
  FIELD_CATEGORY_MAP,
  PUBLIC_FIELD_NAMES,
  PRIVATE_FIELD_NAMES,
  validateFieldNames,
} from "./utils/kyc-fields.js";

export type {
  KycFieldCategory,
  KycFieldDefinition,
} from "./utils/kyc-fields.js";

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
