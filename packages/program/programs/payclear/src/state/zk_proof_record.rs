use anchor_lang::prelude::*;

use crate::constants::*;

#[account]
#[derive(InitSpace)]
pub struct ZkProofRecord {
    /// Institution that recorded this proof
    pub institution: Pubkey,
    /// The wallet this proof attests KYC for
    pub wallet: Pubkey,
    /// SHA-256 of the Reclaim proof identifier
    pub proof_identifier: [u8; 32],
    /// KYC provider name (padded to 32 bytes)
    pub provider: [u8; 32],
    /// PayClear KYC level (0=none, 1=basic, 2=enhanced, 3=institutional)
    pub kyc_level: u8,
    /// Timestamp when the off-chain proof was verified
    pub verified_at: i64,
    /// Timestamp when this proof record expires
    pub expires_at: i64,
    /// Reclaim attestor public key that signed the proof
    pub attestor: Pubkey,
    /// Status: 0=pending, 1=verified, 2=expired, 3=revoked
    pub status: u8,
    /// On-chain creation timestamp
    pub created_at: i64,
    /// PDA bump
    pub bump: u8,
}

impl ZkProofRecord {
    /// Check whether the proof record has an active/verified status.
    pub fn is_valid(&self, current_time: i64) -> bool {
        self.status == ZK_PROOF_STATUS_VERIFIED && !self.is_expired(current_time)
    }

    /// Check whether the proof record has passed its expiry time.
    pub fn is_expired(&self, current_time: i64) -> bool {
        self.expires_at > 0 && current_time > self.expires_at
    }
}
