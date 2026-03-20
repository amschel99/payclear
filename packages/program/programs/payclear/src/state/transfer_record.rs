use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct TransferRecord {
    /// Unique transfer nonce
    pub nonce: [u8; 32],
    /// Sender wallet
    pub sender: Pubkey,
    /// Receiver wallet
    pub receiver: Pubkey,
    /// Token mint
    pub mint: Pubkey,
    /// Transfer amount
    pub amount: u64,
    /// Compliance policy used
    pub compliance_policy: Pubkey,
    /// Associated travel rule record (Pubkey::default if none)
    pub travel_rule_record: Pubkey,
    /// Sender's risk score at time of transfer
    pub sender_risk_score: u8,
    /// Receiver's risk score at time of transfer
    pub receiver_risk_score: u8,
    /// Transfer status (0=pending, 1=completed, 2=failed, 3=flagged)
    pub status: u8,
    /// Execution timestamp
    pub timestamp: i64,
    /// PDA bump
    pub bump: u8,
}
