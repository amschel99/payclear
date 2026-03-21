use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::PayClearError;
use crate::state::{CompliancePolicy, Institution};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PolicyParams {
    pub policy_id: [u8; 32],
    pub min_kyc_level: u8,
    pub max_risk_score: u8,
    pub travel_rule_threshold: u64,
    pub require_both_attested: bool,
    pub allowed_jurisdictions: [u8; 64],
    pub blocked_jurisdictions: [u8; 64],
    pub max_transfer_amount: u64,
    pub daily_limit: u64,
    pub require_civic_pass: bool,
    pub gatekeeper_network: Pubkey,
}

#[derive(Accounts)]
#[instruction(params: PolicyParams)]
pub struct SetCompliancePolicy<'info> {
    #[account(
        seeds = [INSTITUTION_SEED, institution.institution_id.as_ref()],
        bump = institution.bump,
        constraint = institution.active @ PayClearError::InstitutionInactive,
        constraint = authority.key() == institution.authority @ PayClearError::UnauthorizedInstitution,
    )]
    pub institution: Account<'info, Institution>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + CompliancePolicy::INIT_SPACE,
        seeds = [POLICY_SEED, institution.key().as_ref(), params.policy_id.as_ref()],
        bump,
    )]
    pub policy: Account<'info, CompliancePolicy>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SetCompliancePolicy>, params: PolicyParams) -> Result<()> {
    require!(
        params.max_risk_score <= MAX_RISK_SCORE,
        PayClearError::InvalidRiskScore
    );

    let policy = &mut ctx.accounts.policy;
    policy.institution = ctx.accounts.institution.key();
    policy.policy_id = params.policy_id;
    policy.min_kyc_level = params.min_kyc_level;
    policy.max_risk_score = params.max_risk_score;
    policy.travel_rule_threshold = params.travel_rule_threshold;
    policy.require_both_attested = params.require_both_attested;
    policy.allowed_jurisdictions = params.allowed_jurisdictions;
    policy.blocked_jurisdictions = params.blocked_jurisdictions;
    policy.max_transfer_amount = params.max_transfer_amount;
    policy.daily_limit = params.daily_limit;
    policy.active = true;
    policy.require_civic_pass = params.require_civic_pass;
    policy.gatekeeper_network = params.gatekeeper_network;
    policy.bump = ctx.bumps.policy;

    Ok(())
}
