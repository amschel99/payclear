use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::constants::*;
use crate::errors::PayClearError;
use crate::state::{CompliancePolicy, KycAttestation};
use crate::utils::verify_civic_gateway_token;

/// Transfer hook handler with Civic Gateway Token verification.
///
/// This is a superset of the standard TransferHook — it runs all existing
/// PayClear compliance checks AND additionally verifies that both sender
/// and receiver hold active Civic Gateway Tokens (Civic Pass) when the
/// compliance policy requires it.
#[derive(Accounts)]
pub struct CivicTransferHook<'info> {
    /// Source token account
    /// CHECK: Validated by Token-2022 program
    pub source: UncheckedAccount<'info>,

    /// Token mint
    pub mint: InterfaceAccount<'info, Mint>,

    /// Destination token account
    /// CHECK: Validated by Token-2022 program
    pub destination: UncheckedAccount<'info>,

    /// Source token account owner/delegate
    /// CHECK: Validated by Token-2022 program
    pub owner: UncheckedAccount<'info>,

    /// CHECK: ExtraAccountMetaList PDA
    #[account(
        seeds = [EXTRA_ACCOUNT_META_LIST_SEED, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    // --- Extra accounts resolved from ExtraAccountMetaList ---

    /// Sender's KYC attestation (resolved via PDA seeds in ExtraAccountMetaList)
    pub sender_attestation: Account<'info, KycAttestation>,

    /// Receiver's KYC attestation (resolved via PDA seeds in ExtraAccountMetaList)
    pub receiver_attestation: Account<'info, KycAttestation>,

    /// Compliance policy
    pub compliance_policy: Account<'info, CompliancePolicy>,

    /// Sender's Civic Gateway Token (Civic Pass)
    /// CHECK: Verified by PDA derivation and state check in handler
    pub sender_civic_pass: UncheckedAccount<'info>,

    /// Receiver's Civic Gateway Token (Civic Pass)
    /// CHECK: Verified by PDA derivation and state check in handler
    pub receiver_civic_pass: UncheckedAccount<'info>,

    /// The Civic Gatekeeper Network public key
    /// CHECK: Must match the configured network in compliance policy
    pub gatekeeper_network: UncheckedAccount<'info>,
}

pub fn handler_civic_transfer_hook(
    ctx: Context<CivicTransferHook>,
    amount: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let policy = &ctx.accounts.compliance_policy;
    let sender_att = &ctx.accounts.sender_attestation;
    let receiver_att = &ctx.accounts.receiver_attestation;

    // ── Standard PayClear compliance checks ──────────────────────

    // Must be active
    require!(policy.active, PayClearError::PolicyInactive);

    // Check sender attestation
    require!(sender_att.is_active(), PayClearError::AttestationNotActive);
    require!(
        !sender_att.is_expired(now),
        PayClearError::AttestationExpired
    );

    // Check receiver attestation
    require!(
        receiver_att.is_active(),
        PayClearError::AttestationNotActive
    );
    require!(
        !receiver_att.is_expired(now),
        PayClearError::AttestationExpired
    );

    // KYC level checks
    require!(
        sender_att.kyc_level >= policy.min_kyc_level,
        PayClearError::InsufficientKycLevel
    );
    require!(
        receiver_att.kyc_level >= policy.min_kyc_level,
        PayClearError::InsufficientKycLevel
    );

    // Risk score checks
    require!(
        sender_att.risk_score <= policy.max_risk_score,
        PayClearError::RiskScoreTooHigh
    );
    require!(
        receiver_att.risk_score <= policy.max_risk_score,
        PayClearError::RiskScoreTooHigh
    );

    // Transfer amount check
    if policy.max_transfer_amount > 0 {
        require!(
            amount <= policy.max_transfer_amount,
            PayClearError::TransferAmountExceeded
        );
    }

    // ── Civic Gateway Token verification ─────────────────────────

    if policy.require_civic_pass {
        // Validate the gatekeeper network matches policy configuration
        require!(
            ctx.accounts.gatekeeper_network.key() == policy.gatekeeper_network,
            PayClearError::InvalidGatekeeperNetwork
        );

        let sender_wallet = &ctx.accounts.owner.key();
        let gk_network = &ctx.accounts.gatekeeper_network.key();

        // Verify sender's Civic Pass
        verify_civic_gateway_token(
            &ctx.accounts.sender_civic_pass.to_account_info(),
            sender_wallet,
            gk_network,
        )?;

        // For the receiver, we use the destination token account owner.
        // In Token-2022 transfer hook, the destination owner is inferred from
        // the receiver attestation's wallet field (which was PDA-resolved).
        let receiver_wallet = &ctx.accounts.receiver_attestation.wallet;

        verify_civic_gateway_token(
            &ctx.accounts.receiver_civic_pass.to_account_info(),
            receiver_wallet,
            gk_network,
        )?;
    }

    Ok(())
}
