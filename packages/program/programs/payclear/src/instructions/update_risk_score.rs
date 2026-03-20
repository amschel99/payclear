use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::PayClearError;
use crate::state::{Institution, KycAttestation};

#[derive(Accounts)]
#[instruction(new_risk_score: u8)]
pub struct UpdateRiskScore<'info> {
    #[account(
        seeds = [INSTITUTION_SEED, institution.institution_id.as_ref()],
        bump = institution.bump,
        constraint = authority.key() == institution.authority @ PayClearError::UnauthorizedInstitution,
    )]
    pub institution: Account<'info, Institution>,

    #[account(
        mut,
        seeds = [KYC_SEED, institution.key().as_ref(), attestation.wallet.as_ref()],
        bump = attestation.bump,
        constraint = attestation.institution == institution.key(),
    )]
    pub attestation: Account<'info, KycAttestation>,

    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateRiskScore>, new_risk_score: u8) -> Result<()> {
    require!(
        new_risk_score <= MAX_RISK_SCORE,
        PayClearError::InvalidRiskScore
    );

    let attestation = &mut ctx.accounts.attestation;
    attestation.risk_score = new_risk_score;
    attestation.updated_at = Clock::get()?.unix_timestamp;
    Ok(())
}
