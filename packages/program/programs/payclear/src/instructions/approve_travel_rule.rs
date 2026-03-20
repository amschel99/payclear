use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::PayClearError;
use crate::state::{Institution, TravelRuleRecord};

#[derive(Accounts)]
pub struct ApproveTravelRule<'info> {
    #[account(
        seeds = [INSTITUTION_SEED, beneficiary_institution.institution_id.as_ref()],
        bump = beneficiary_institution.bump,
        constraint = beneficiary_institution.active @ PayClearError::InstitutionInactive,
        constraint = authority.key() == beneficiary_institution.authority @ PayClearError::UnauthorizedInstitution,
    )]
    pub beneficiary_institution: Account<'info, Institution>,

    #[account(
        mut,
        seeds = [TRAVEL_RULE_SEED, travel_rule_record.transfer_nonce.as_ref()],
        bump = travel_rule_record.bump,
        constraint = travel_rule_record.beneficiary_institution == beneficiary_institution.key(),
        constraint = travel_rule_record.status == TRAVEL_RULE_PENDING @ PayClearError::InvalidStatusTransition,
    )]
    pub travel_rule_record: Account<'info, TravelRuleRecord>,

    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<ApproveTravelRule>) -> Result<()> {
    let record = &mut ctx.accounts.travel_rule_record;
    record.status = TRAVEL_RULE_APPROVED;
    Ok(())
}
