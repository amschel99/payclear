export { PayClearClient } from "./client.js";
export type {
  PayClearClientConfig,
  RegisterInstitutionParams,
  CreateAttestationParams,
  PolicyParams,
  TransferParams,
  TravelRuleParams,
  TransferResult,
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
} from "./accounts/pda.js";

// Account types
export type {
  Registry,
  Institution,
  KycAttestation,
  CompliancePolicy,
  TravelRuleRecord,
  TransferRecord,
} from "./accounts/types.js";

export {
  KycStatus,
  KycLevel,
  TravelRuleStatus,
  TransferStatus,
} from "./accounts/types.js";

// Utilities
export {
  sha256,
  hashTravelRuleData,
  hashKycData,
  toInstitutionId,
  generateNonce,
} from "./utils/hash.js";
