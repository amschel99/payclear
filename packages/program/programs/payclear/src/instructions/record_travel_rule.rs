use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::PayClearError;
use crate::state::{Institution, TravelRuleRecord};

#[derive(Accounts)]
#[instruction(
    transfer_nonce: [u8; 32],
    beneficiary_wallet: Pubkey,
    amount: u64,
    token_mint: Pubkey,
    originator_data_hash: [u8; 32],
    beneficiary_data_hash: [u8; 32],
)]
pub struct RecordTravelRule<'info> {
    #[account(
        seeds = [INSTITUTION_SEED, originator_institution.institution_id.as_ref()],
        bump = originator_institution.bump,
        constraint = originator_institution.active @ PayClearError::InstitutionInactive,
        constraint = authority.key() == originator_institution.authority @ PayClearError::UnauthorizedInstitution,
    )]
    pub originator_institution: Account<'info, Institution>,

    #[account(
        seeds = [INSTITUTION_SEED, beneficiary_institution.institution_id.as_ref()],
        bump = beneficiary_institution.bump,
    )]
    pub beneficiary_institution: Account<'info, Institution>,

    #[account(
        init,
        payer = authority,
        space = 8 + TravelRuleRecord::INIT_SPACE,
        seeds = [TRAVEL_RULE_SEED, transfer_nonce.as_ref()],
        bump,
    )]
    pub travel_rule_record: Account<'info, TravelRuleRecord>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RecordTravelRule>,
    transfer_nonce: [u8; 32],
    beneficiary_wallet: Pubkey,
    amount: u64,
    token_mint: Pubkey,
    originator_data_hash: [u8; 32],
    beneficiary_data_hash: [u8; 32],
) -> Result<()> {
    let record = &mut ctx.accounts.travel_rule_record;
    record.transfer_nonce = transfer_nonce;
    record.originator_institution = ctx.accounts.originator_institution.key();
    record.beneficiary_institution = ctx.accounts.beneficiary_institution.key();
    record.originator_wallet = ctx.accounts.authority.key();
    record.beneficiary_wallet = beneficiary_wallet;
    record.amount = amount;
    record.token_mint = token_mint;
    record.originator_data_hash = originator_data_hash;
    record.beneficiary_data_hash = beneficiary_data_hash;
    record.status = TRAVEL_RULE_PENDING;
    record.created_at = Clock::get()?.unix_timestamp;
    record.bump = ctx.bumps.travel_rule_record;

    Ok(())
}
