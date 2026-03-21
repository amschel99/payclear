/// PDA seed prefixes
pub const REGISTRY_SEED: &[u8] = b"registry";
pub const INSTITUTION_SEED: &[u8] = b"institution";
pub const KYC_SEED: &[u8] = b"kyc";
pub const POLICY_SEED: &[u8] = b"policy";
pub const TRAVEL_RULE_SEED: &[u8] = b"travel_rule";
pub const TRANSFER_SEED: &[u8] = b"transfer";
pub const EXTRA_ACCOUNT_META_LIST_SEED: &[u8] = b"extra-account-metas";

/// KYC status values
pub const KYC_STATUS_PENDING: u8 = 0;
pub const KYC_STATUS_ACTIVE: u8 = 1;
pub const KYC_STATUS_SUSPENDED: u8 = 2;
pub const KYC_STATUS_REVOKED: u8 = 3;

/// KYC levels
pub const KYC_LEVEL_NONE: u8 = 0;
pub const KYC_LEVEL_BASIC: u8 = 1;
pub const KYC_LEVEL_ENHANCED: u8 = 2;
pub const KYC_LEVEL_INSTITUTIONAL: u8 = 3;

/// Travel Rule status
pub const TRAVEL_RULE_PENDING: u8 = 0;
pub const TRAVEL_RULE_APPROVED: u8 = 1;
pub const TRAVEL_RULE_REJECTED: u8 = 2;
pub const TRAVEL_RULE_SETTLED: u8 = 3;

/// Transfer status
pub const TRANSFER_STATUS_PENDING: u8 = 0;
pub const TRANSFER_STATUS_COMPLETED: u8 = 1;
pub const TRANSFER_STATUS_FAILED: u8 = 2;
pub const TRANSFER_STATUS_FLAGGED: u8 = 3;

/// Max risk score
pub const MAX_RISK_SCORE: u8 = 100;
