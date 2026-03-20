use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Registry {
    /// Super-admin authority (multisig recommended)
    pub authority: Pubkey,
    /// Total institutions registered
    pub institution_count: u64,
    /// Total KYC attestations issued
    pub attestation_count: u64,
    /// Total compliant transfers executed
    pub transfer_count: u64,
    /// Global kill switch
    pub paused: bool,
    /// PDA bump
    pub bump: u8,
}
