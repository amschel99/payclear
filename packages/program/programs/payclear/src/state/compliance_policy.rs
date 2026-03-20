use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct CompliancePolicy {
    /// Institution this policy belongs to
    pub institution: Pubkey,
    /// Unique policy identifier
    pub policy_id: [u8; 32],
    /// Minimum KYC level required (0-3)
    pub min_kyc_level: u8,
    /// Maximum acceptable KYT risk score (0-100)
    pub max_risk_score: u8,
    /// Amount threshold (in token smallest unit) above which Travel Rule applies
    pub travel_rule_threshold: u64,
    /// Whether both sender and receiver must have attestations
    pub require_both_attested: bool,
    /// Bitmask of allowed jurisdictions (0 = all allowed)
    pub allowed_jurisdictions: [u8; 64],
    /// Bitmask of blocked jurisdictions
    pub blocked_jurisdictions: [u8; 64],
    /// Maximum single transfer amount (0 = unlimited)
    pub max_transfer_amount: u64,
    /// Daily cumulative limit (0 = unlimited)
    pub daily_limit: u64,
    /// Whether this policy is active
    pub active: bool,
    /// PDA bump
    pub bump: u8,
}
