use anchor_lang::prelude::*;

use crate::constants::*;

#[account]
#[derive(InitSpace)]
pub struct KycAttestation {
    /// Institution PDA that issued this attestation
    pub institution: Pubkey,
    /// The wallet address being attested
    pub wallet: Pubkey,
    /// SHA-256 of the off-chain KYC data
    pub kyc_hash: [u8; 32],
    /// KYC verification level (0=none, 1=basic, 2=enhanced, 3=institutional)
    pub kyc_level: u8,
    /// KYT risk score (0-100, lower is better)
    pub risk_score: u8,
    /// Attestation status (0=pending, 1=active, 2=suspended, 3=revoked)
    pub status: u8,
    /// Expiration timestamp (0 = no expiry)
    pub expires_at: i64,
    /// Creation timestamp
    pub created_at: i64,
    /// Last update timestamp
    pub updated_at: i64,
    /// PDA bump
    pub bump: u8,
}

impl KycAttestation {
    pub fn is_active(&self) -> bool {
        self.status == KYC_STATUS_ACTIVE
    }

    pub fn is_expired(&self, current_time: i64) -> bool {
        self.expires_at > 0 && current_time > self.expires_at
    }

    pub fn is_valid(&self, current_time: i64) -> bool {
        self.is_active() && !self.is_expired(current_time)
    }
}
