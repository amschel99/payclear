use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::PayClearError;
use crate::state::{Institution, KycAttestation, Registry};

#[derive(Accounts)]
#[instruction(kyc_hash: [u8; 32], kyc_level: u8, risk_score: u8, expires_at: i64)]
pub struct CreateKycAttestation<'info> {
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

    /// The wallet being attested
    /// CHECK: This is the wallet address we're creating an attestation for
    pub wallet: UncheckedAccount<'info>,

    #[account(
        init,
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

pub fn handler(
    ctx: Context<CreateKycAttestation>,
    kyc_hash: [u8; 32],
    kyc_level: u8,
    risk_score: u8,
    expires_at: i64,
) -> Result<()> {
    require!(risk_score <= MAX_RISK_SCORE, PayClearError::InvalidRiskScore);

    let now = Clock::get()?.unix_timestamp;

    let attestation = &mut ctx.accounts.attestation;
    attestation.institution = ctx.accounts.institution.key();
    attestation.wallet = ctx.accounts.wallet.key();
    attestation.kyc_hash = kyc_hash;
    attestation.kyc_level = kyc_level;
    attestation.risk_score = risk_score;
    attestation.status = KYC_STATUS_ACTIVE;
    attestation.expires_at = expires_at;
    attestation.created_at = now;
    attestation.updated_at = now;
    // First-party attestation — no original institution
    attestation.original_institution = Pubkey::default();
    attestation.bump = ctx.bumps.attestation;

    let institution = &mut ctx.accounts.institution;
    institution.attestation_count = institution
        .attestation_count
        .checked_add(1)
        .ok_or(PayClearError::ArithmeticOverflow)?;

    Ok(())
}
