use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::PayClearError;
use crate::state::{Institution, KycAttestation, Registry, ZkProofRecord};

#[derive(Accounts)]
pub struct VerifyZkAttestation<'info> {
    #[account(
        seeds = [REGISTRY_SEED],
        bump = registry.bump,
        constraint = !registry.paused @ PayClearError::RegistryPaused,
    )]
    pub registry: Account<'info, Registry>,

    #[account(
        mut,
        seeds = [INSTITUTION_SEED, institution.institution_id.as_ref()],
        bump = institution.bump,
        constraint = institution.active @ PayClearError::InstitutionInactive,
        constraint = authority.key() == institution.authority @ PayClearError::UnauthorizedInstitution,
    )]
    pub institution: Account<'info, Institution>,

    /// The wallet being attested.
    /// CHECK: This is the wallet address referenced by the ZK proof.
    pub wallet: UncheckedAccount<'info>,

    #[account(
        seeds = [
            ZK_PROOF_SEED,
            institution.key().as_ref(),
            wallet.key().as_ref(),
            zk_proof_record.proof_identifier.as_ref(),
        ],
        bump = zk_proof_record.bump,
        constraint = zk_proof_record.institution == institution.key() @ PayClearError::ZkProofInvalid,
        constraint = zk_proof_record.wallet == wallet.key() @ PayClearError::ZkProofInvalid,
        constraint = zk_proof_record.status == ZK_PROOF_STATUS_VERIFIED @ PayClearError::ZkProofInvalid,
    )]
    pub zk_proof_record: Account<'info, ZkProofRecord>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + KycAttestation::INIT_SPACE,
        seeds = [KYC_SEED, institution.key().as_ref(), wallet.key().as_ref()],
        bump,
    )]
    pub attestation: Account<'info, KycAttestation>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<VerifyZkAttestation>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let proof = &ctx.accounts.zk_proof_record;

    // Ensure the ZK proof hasn't expired
    require!(!proof.is_expired(now), PayClearError::ZkProofExpired);

    let attestation = &mut ctx.accounts.attestation;

    // Use the proof identifier hash as the kyc_hash to link attestation to proof
    attestation.institution = ctx.accounts.institution.key();
    attestation.wallet = ctx.accounts.wallet.key();
    attestation.kyc_hash = proof.proof_identifier;
    attestation.kyc_level = proof.kyc_level;
    attestation.risk_score = 0; // ZK proofs don't carry risk scores; default to 0
    attestation.status = KYC_STATUS_ACTIVE;
    attestation.expires_at = proof.expires_at;
    attestation.original_institution = Pubkey::default();
    attestation.created_at = now;
    attestation.updated_at = now;
    attestation.bump = ctx.bumps.attestation;

    // Increment attestation counter on the institution
    let institution = &mut ctx.accounts.institution;
    institution.attestation_count = institution
        .attestation_count
        .checked_add(1)
        .ok_or(PayClearError::ArithmeticOverflow)?;

    Ok(())
}
