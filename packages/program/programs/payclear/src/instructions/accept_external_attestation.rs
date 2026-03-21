use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::PayClearError;
use crate::state::{Institution, KycAttestation, Registry, TrustNetwork};

/// Accepts an external KYC attestation from a trusted institution, creating a
/// new first-class attestation under the accepting institution.
///
/// **Why this exists:** In institutional stablecoin payments, the same wallet
/// often transacts with multiple VASPs. Without KYC portability, each VASP
/// must independently verify the wallet's identity — a process that can take
/// days and requires re-sharing sensitive PII. This instruction lets
/// Institution A recognize Institution B's KYC work, creating a lightweight
/// attestation that the compliance engine treats identically to a direct KYC.
///
/// **What it validates:**
/// 1. The accepting institution has a trust network that includes the external
///    institution.
/// 2. The external attestation is active and not expired.
/// 3. The external attestation's KYC level meets the trust network's minimum.
/// 4. If `require_same_jurisdiction` is set, both institutions share the same
///    ISO 3166-1 alpha-2 jurisdiction code.
///
/// **What it creates:** A new KycAttestation PDA under the accepting
/// institution, with `original_institution` set to the external institution
/// for provenance tracking. The KYC hash is copied from the external
/// attestation since it references the same underlying identity data.
///
/// **Lifecycle independence:** Once created, the accepted attestation is fully
/// independent. If the original attestation is later revoked, the accepted
/// attestation remains valid. This is intentional — the accepting institution
/// made a trust decision, and reversing it requires explicit action. In
/// production, this prevents a single institution's revocation from cascading
/// across the network and disrupting payment flows for all counterparties.
#[derive(Accounts)]
pub struct AcceptExternalAttestation<'info> {
    #[account(
        seeds = [REGISTRY_SEED],
        bump = registry.bump,
        constraint = !registry.paused @ PayClearError::RegistryPaused,
    )]
    pub registry: Account<'info, Registry>,

    /// The institution that is accepting the external attestation
    #[account(
        mut,
        seeds = [INSTITUTION_SEED, accepting_institution.institution_id.as_ref()],
        bump = accepting_institution.bump,
        constraint = accepting_institution.active @ PayClearError::InstitutionInactive,
        constraint = authority.key() == accepting_institution.authority @ PayClearError::UnauthorizedInstitution,
    )]
    pub accepting_institution: Account<'info, Institution>,

    /// The institution that originally issued the KYC attestation
    #[account(
        seeds = [INSTITUTION_SEED, external_institution.institution_id.as_ref()],
        bump = external_institution.bump,
        // We intentionally do NOT require external_institution.active here.
        // The attestation itself is what matters — an institution that has
        // deactivated may still have valid, unexpired attestations that other
        // institutions have agreed to trust.
    )]
    pub external_institution: Account<'info, Institution>,

    /// The accepting institution's trust network — must include the external institution
    #[account(
        seeds = [TRUST_NETWORK_SEED, accepting_institution.key().as_ref()],
        bump = trust_network.bump,
        constraint = trust_network.institution == accepting_institution.key() @ PayClearError::UnauthorizedInstitution,
    )]
    pub trust_network: Account<'info, TrustNetwork>,

    /// The external attestation being accepted
    #[account(
        seeds = [KYC_SEED, external_institution.key().as_ref(), wallet.key().as_ref()],
        bump = external_attestation.bump,
    )]
    pub external_attestation: Account<'info, KycAttestation>,

    /// The wallet whose attestation is being accepted
    /// CHECK: Used for PDA derivation — validated through the external attestation's seeds
    pub wallet: UncheckedAccount<'info>,

    /// New attestation PDA under the accepting institution
    #[account(
        init,
        payer = authority,
        space = 8 + KycAttestation::INIT_SPACE,
        seeds = [KYC_SEED, accepting_institution.key().as_ref(), wallet.key().as_ref()],
        bump,
    )]
    pub accepted_attestation: Account<'info, KycAttestation>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AcceptExternalAttestation>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let trust_network = &ctx.accounts.trust_network;
    let external_att = &ctx.accounts.external_attestation;
    let external_inst_key = ctx.accounts.external_institution.key();

    // 1. Verify the external institution is in the trust network
    require!(
        trust_network
            .trusted_institutions
            .contains(&external_inst_key),
        PayClearError::InstitutionNotTrusted
    );

    // 2. Verify the external attestation is currently valid
    require!(
        external_att.is_active(),
        PayClearError::ExternalAttestationInvalid
    );
    require!(
        !external_att.is_expired(now),
        PayClearError::ExternalAttestationInvalid
    );

    // 3. Verify KYC level meets the trust network's minimum
    require!(
        external_att.kyc_level >= trust_network.min_accepted_kyc_level,
        PayClearError::KycLevelInsufficient
    );

    // 4. If required, verify both institutions share the same jurisdiction
    if trust_network.require_same_jurisdiction {
        require!(
            ctx.accounts.accepting_institution.jurisdiction
                == ctx.accounts.external_institution.jurisdiction,
            PayClearError::JurisdictionMismatch
        );
    }

    // 5. Create the accepted attestation
    let accepted = &mut ctx.accounts.accepted_attestation;
    accepted.institution = ctx.accounts.accepting_institution.key();
    accepted.wallet = ctx.accounts.wallet.key();
    // Copy the KYC hash from the external attestation — same identity data
    accepted.kyc_hash = external_att.kyc_hash;
    accepted.kyc_level = external_att.kyc_level;
    accepted.risk_score = external_att.risk_score;
    accepted.status = KYC_STATUS_ACTIVE;
    // Inherit the external attestation's expiration, or use its remaining
    // lifetime, whichever is more conservative
    accepted.expires_at = external_att.expires_at;
    accepted.created_at = now;
    accepted.updated_at = now;
    // Record provenance: this attestation originated from the external institution
    accepted.original_institution = external_inst_key;
    accepted.bump = ctx.bumps.accepted_attestation;

    // 6. Increment the accepting institution's attestation count
    let institution = &mut ctx.accounts.accepting_institution;
    institution.attestation_count = institution
        .attestation_count
        .checked_add(1)
        .ok_or(PayClearError::ArithmeticOverflow)?;

    // 7. Emit event for off-chain indexing
    emit!(ExternalAttestationAcceptedEvent {
        accepting_institution: institution.key(),
        external_institution: external_inst_key,
        wallet: ctx.accounts.wallet.key(),
        kyc_level: external_att.kyc_level,
        risk_score: external_att.risk_score,
        timestamp: now,
    });

    Ok(())
}

#[event]
pub struct ExternalAttestationAcceptedEvent {
    pub accepting_institution: Pubkey,
    pub external_institution: Pubkey,
    pub wallet: Pubkey,
    pub kyc_level: u8,
    pub risk_score: u8,
    pub timestamp: i64,
}
