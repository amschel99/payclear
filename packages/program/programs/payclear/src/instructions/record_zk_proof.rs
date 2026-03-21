use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::PayClearError;
use crate::state::{Institution, ZkProofRecord};

#[derive(Accounts)]
#[instruction(
    proof_identifier: [u8; 32],
    provider: [u8; 32],
    kyc_level: u8,
    verified_at: i64,
    expires_at: i64,
    attestor: Pubkey,
)]
pub struct RecordZkProof<'info> {
    #[account(
        seeds = [INSTITUTION_SEED, institution.institution_id.as_ref()],
        bump = institution.bump,
        constraint = institution.active @ PayClearError::InstitutionInactive,
        constraint = authority.key() == institution.authority @ PayClearError::UnauthorizedInstitution,
    )]
    pub institution: Account<'info, Institution>,

    /// The wallet this proof attests KYC for.
    /// CHECK: This is the wallet address we're recording a proof for.
    pub wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + ZkProofRecord::INIT_SPACE,
        seeds = [ZK_PROOF_SEED, institution.key().as_ref(), wallet.key().as_ref(), proof_identifier.as_ref()],
        bump,
    )]
    pub zk_proof_record: Account<'info, ZkProofRecord>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RecordZkProof>,
    proof_identifier: [u8; 32],
    provider: [u8; 32],
    kyc_level: u8,
    verified_at: i64,
    expires_at: i64,
    attestor: Pubkey,
) -> Result<()> {
    require!(
        kyc_level <= KYC_LEVEL_INSTITUTIONAL,
        PayClearError::ZkProofInvalid
    );

    let now = Clock::get()?.unix_timestamp;

    // Reject proofs that are already expired at recording time
    if expires_at > 0 {
        require!(expires_at > now, PayClearError::ZkProofExpired);
    }

    let record = &mut ctx.accounts.zk_proof_record;
    record.institution = ctx.accounts.institution.key();
    record.wallet = ctx.accounts.wallet.key();
    record.proof_identifier = proof_identifier;
    record.provider = provider;
    record.kyc_level = kyc_level;
    record.verified_at = verified_at;
    record.expires_at = expires_at;
    record.attestor = attestor;
    record.status = ZK_PROOF_STATUS_VERIFIED;
    record.created_at = now;
    record.bump = ctx.bumps.zk_proof_record;

    Ok(())
}
