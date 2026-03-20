use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Institution {
    /// SHA-256 hash of the institution's unique identifier
    pub institution_id: [u8; 32],
    /// Institution admin keypair
    pub authority: Pubkey,
    /// VASP identifier (LEI, LNURL, etc.)
    pub vasp_code: [u8; 16],
    /// ISO 3166-1 alpha-2 country code
    pub jurisdiction: [u8; 2],
    /// Whether this institution is active
    pub active: bool,
    /// Number of KYC attestations issued by this institution
    pub attestation_count: u64,
    /// Default compliance policy PDA for this institution
    pub default_policy: Pubkey,
    /// Unix timestamp when registered
    pub created_at: i64,
    /// PDA bump
    pub bump: u8,
}
