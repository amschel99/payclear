use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::PayClearError;
use crate::state::{Institution, Registry};

#[derive(Accounts)]
#[instruction(institution_id: [u8; 32], vasp_code: [u8; 16], jurisdiction: [u8; 2])]
pub struct RegisterInstitution<'info> {
    #[account(
        mut,
        seeds = [REGISTRY_SEED],
        bump = registry.bump,
        constraint = !registry.paused @ PayClearError::RegistryPaused,
    )]
    pub registry: Account<'info, Registry>,

    #[account(
        init,
        payer = authority,
        space = 8 + Institution::INIT_SPACE,
        seeds = [INSTITUTION_SEED, institution_id.as_ref()],
        bump,
    )]
    pub institution: Account<'info, Institution>,

    /// The institution's admin authority
    pub institution_authority: SystemAccount<'info>,

    #[account(
        mut,
        constraint = authority.key() == registry.authority @ PayClearError::UnauthorizedRegistry,
    )]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RegisterInstitution>,
    institution_id: [u8; 32],
    vasp_code: [u8; 16],
    jurisdiction: [u8; 2],
) -> Result<()> {
    let institution = &mut ctx.accounts.institution;
    institution.institution_id = institution_id;
    institution.authority = ctx.accounts.institution_authority.key();
    institution.vasp_code = vasp_code;
    institution.jurisdiction = jurisdiction;
    institution.active = true;
    institution.attestation_count = 0;
    institution.default_policy = Pubkey::default();
    institution.created_at = Clock::get()?.unix_timestamp;
    institution.bump = ctx.bumps.institution;

    let registry = &mut ctx.accounts.registry;
    registry.institution_count = registry
        .institution_count
        .checked_add(1)
        .ok_or(PayClearError::ArithmeticOverflow)?;

    Ok(())
}
