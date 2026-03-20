use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct TravelRuleRecord {
    /// Unique identifier linking to the off-chain payload
    pub transfer_nonce: [u8; 32],
    /// Originator VASP (institution PDA)
    pub originator_institution: Pubkey,
    /// Beneficiary VASP (institution PDA)
    pub beneficiary_institution: Pubkey,
    /// Originator wallet address
    pub originator_wallet: Pubkey,
    /// Beneficiary wallet address
    pub beneficiary_wallet: Pubkey,
    /// Transfer amount
    pub amount: u64,
    /// Token mint address
    pub token_mint: Pubkey,
    /// SHA-256 of full originator IVMS101 data
    pub originator_data_hash: [u8; 32],
    /// SHA-256 of full beneficiary IVMS101 data
    pub beneficiary_data_hash: [u8; 32],
    /// Status (0=pending, 1=approved, 2=rejected, 3=settled)
    pub status: u8,
    /// Creation timestamp
    pub created_at: i64,
    /// PDA bump
    pub bump: u8,
}
