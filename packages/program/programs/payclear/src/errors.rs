use anchor_lang::prelude::*;

#[error_code]
pub enum PayClearError {
    #[msg("Registry is paused")]
    RegistryPaused,

    #[msg("Institution is not active")]
    InstitutionInactive,

    #[msg("Unauthorized: signer is not the institution authority")]
    UnauthorizedInstitution,

    #[msg("Unauthorized: signer is not the registry authority")]
    UnauthorizedRegistry,

    #[msg("KYC attestation is not active")]
    AttestationNotActive,

    #[msg("KYC attestation has expired")]
    AttestationExpired,

    #[msg("KYC level does not meet minimum requirement")]
    InsufficientKycLevel,

    #[msg("Risk score exceeds maximum allowed")]
    RiskScoreTooHigh,

    #[msg("Invalid risk score: must be 0-100")]
    InvalidRiskScore,

    #[msg("Travel Rule record is required for this transfer amount")]
    TravelRuleRequired,

    #[msg("Travel Rule record has not been approved")]
    TravelRuleNotApproved,

    #[msg("Transfer amount exceeds maximum allowed")]
    TransferAmountExceeded,

    #[msg("Daily transfer limit exceeded")]
    DailyLimitExceeded,

    #[msg("Sender jurisdiction is blocked")]
    SenderJurisdictionBlocked,

    #[msg("Receiver jurisdiction is blocked")]
    ReceiverJurisdictionBlocked,

    #[msg("Both sender and receiver must have KYC attestations")]
    BothPartiesRequireAttestation,

    #[msg("Invalid KYC status transition")]
    InvalidStatusTransition,

    #[msg("Travel Rule record does not match transfer parameters")]
    TravelRuleMismatch,

    #[msg("Invalid nonce: must be 32 bytes")]
    InvalidNonce,

    #[msg("Transfer nonce already used")]
    NonceAlreadyUsed,

    #[msg("Policy is not active")]
    PolicyInactive,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    // ─── Trust Network Errors ────────────────────────────────

    #[msg("Institution is not in the trust network")]
    InstitutionNotTrusted,

    #[msg("External attestation KYC level does not meet minimum requirement")]
    KycLevelInsufficient,

    #[msg("Trust network is full (maximum 32 trusted institutions)")]
    TrustNetworkFull,

    #[msg("Institution is already in the trust network")]
    InstitutionAlreadyTrusted,

    #[msg("Institution not found in the trust network")]
    InstitutionNotInTrustNetwork,

    #[msg("External attestation is not active or has expired")]
    ExternalAttestationInvalid,

    #[msg("Jurisdiction mismatch: trust network requires same jurisdiction")]
    JurisdictionMismatch,

    #[msg("Cannot add own institution to trust network")]
    CannotTrustSelf,

    // ─── Civic Gateway Errors ─────────────────────────────────

    #[msg("Civic Pass is not active")]
    CivicPassNotActive,

    #[msg("Civic Pass not found for wallet")]
    CivicPassNotFound,

    #[msg("Civic Pass has expired")]
    CivicPassExpired,

    #[msg("Invalid gatekeeper network")]
    InvalidGatekeeperNetwork,

    // ─── ZK Proof Errors ──────────────────────────────────────

    #[msg("ZK proof has expired")]
    ZkProofExpired,

    #[msg("ZK proof is invalid")]
    ZkProofInvalid,

    #[msg("Attestor is not trusted")]
    UntrustedAttestor,

    #[msg("This proof has already been recorded")]
    ProofAlreadyRecorded,
}
