use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::PayClearError;
use crate::state::{Institution, TrustNetwork};
use crate::state::trust_network::MAX_TRUSTED_INSTITUTIONS;

// ─── Initialize or Add to Trust Network ─────────────────────

#[derive(Accounts)]
pub struct AddTrustedInstitution<'info> {
    #[account(
        seeds = [INSTITUTION_SEED, institution.institution_id.as_ref()],
        bump = institution.bump,
        constraint = institution.active @ PayClearError::InstitutionInactive,
        constraint = authority.key() == institution.authority @ PayClearError::UnauthorizedInstitution,
    )]
    pub institution: Account<'info, Institution>,

    /// The institution to be trusted. We load the full account to verify it
    /// exists and is active — we don't blindly trust arbitrary pubkeys.
    #[account(
        seeds = [INSTITUTION_SEED, trusted_institution.institution_id.as_ref()],
        bump = trusted_institution.bump,
        constraint = trusted_institution.active @ PayClearError::InstitutionInactive,
    )]
    pub trusted_institution: Account<'info, Institution>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + TrustNetwork::INIT_SPACE,
        seeds = [TRUST_NETWORK_SEED, institution.key().as_ref()],
        bump,
    )]
    pub trust_network: Account<'info, TrustNetwork>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler_add_trusted_institution(
    ctx: Context<AddTrustedInstitution>,
    min_accepted_kyc_level: u8,
    require_same_jurisdiction: bool,
) -> Result<()> {
    let institution_key = ctx.accounts.institution.key();
    let trusted_key = ctx.accounts.trusted_institution.key();

    // Cannot add yourself to your own trust network
    require!(
        institution_key != trusted_key,
        PayClearError::CannotTrustSelf
    );

    let trust_network = &mut ctx.accounts.trust_network;

    // Initialize institution field if this is a new account
    if trust_network.institution == Pubkey::default() {
        trust_network.institution = institution_key;
        trust_network.bump = ctx.bumps.trust_network;
    }

    // Check if already trusted
    require!(
        !trust_network.trusted_institutions.contains(&trusted_key),
        PayClearError::InstitutionAlreadyTrusted
    );

    // Check capacity
    require!(
        trust_network.trusted_institutions.len() < MAX_TRUSTED_INSTITUTIONS,
        PayClearError::TrustNetworkFull
    );

    trust_network.trusted_institutions.push(trusted_key);
    trust_network.min_accepted_kyc_level = min_accepted_kyc_level;
    trust_network.require_same_jurisdiction = require_same_jurisdiction;

    emit!(TrustNetworkUpdatedEvent {
        institution: institution_key,
        trusted_institution: trusted_key,
        action: TrustAction::Added,
        trusted_count: trust_network.trusted_institutions.len() as u8,
    });

    Ok(())
}

// ─── Remove from Trust Network ──────────────────────────────

#[derive(Accounts)]
pub struct RemoveTrustedInstitution<'info> {
    #[account(
        seeds = [INSTITUTION_SEED, institution.institution_id.as_ref()],
        bump = institution.bump,
        constraint = authority.key() == institution.authority @ PayClearError::UnauthorizedInstitution,
    )]
    pub institution: Account<'info, Institution>,

    #[account(
        mut,
        seeds = [TRUST_NETWORK_SEED, institution.key().as_ref()],
        bump = trust_network.bump,
        constraint = trust_network.institution == institution.key() @ PayClearError::UnauthorizedInstitution,
    )]
    pub trust_network: Account<'info, TrustNetwork>,

    pub authority: Signer<'info>,
}

/// Removes an institution from the trust network.
///
/// **Important:** This does NOT retroactively revoke any attestations that
/// were previously accepted based on trust in the removed institution.
/// Those attestations are first-class attestations owned by the accepting
/// institution — they must be explicitly revoked if desired. This is by
/// design: in production, removing a trust relationship should not cause
/// cascading failures for wallets that already passed KYC acceptance.
pub fn handler_remove_trusted_institution(
    ctx: Context<RemoveTrustedInstitution>,
    trusted_institution: Pubkey,
) -> Result<()> {
    let trust_network = &mut ctx.accounts.trust_network;

    let pos = trust_network
        .trusted_institutions
        .iter()
        .position(|k| *k == trusted_institution)
        .ok_or(PayClearError::InstitutionNotInTrustNetwork)?;

    // swap_remove is O(1) — order doesn't matter for a trust set
    trust_network.trusted_institutions.swap_remove(pos);

    emit!(TrustNetworkUpdatedEvent {
        institution: ctx.accounts.institution.key(),
        trusted_institution,
        action: TrustAction::Removed,
        trusted_count: trust_network.trusted_institutions.len() as u8,
    });

    Ok(())
}

// ─── Events ─────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TrustAction {
    Added,
    Removed,
}

#[event]
pub struct TrustNetworkUpdatedEvent {
    pub institution: Pubkey,
    pub trusted_institution: Pubkey,
    pub action: TrustAction,
    pub trusted_count: u8,
}
