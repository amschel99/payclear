use anchor_lang::prelude::*;

use crate::constants::REGISTRY_SEED;
use crate::state::Registry;

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Registry::INIT_SPACE,
        seeds = [REGISTRY_SEED],
        bump,
    )]
    pub registry: Account<'info, Registry>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeRegistry>) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    registry.authority = ctx.accounts.authority.key();
    registry.institution_count = 0;
    registry.attestation_count = 0;
    registry.transfer_count = 0;
    registry.paused = false;
    registry.bump = ctx.bumps.registry;
    Ok(())
}
