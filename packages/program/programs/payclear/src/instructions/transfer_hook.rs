use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use crate::constants::*;
use crate::errors::PayClearError;
use crate::state::{CompliancePolicy, KycAttestation};

/// Initialize the ExtraAccountMetaList for a Token-2022 mint
/// that wants to use PayClear as its transfer hook program.
#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    /// CHECK: Validated by seeds — this is the ExtraAccountMetaList PDA
    #[account(
        mut,
        seeds = [EXTRA_ACCOUNT_META_LIST_SEED, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// The Token-2022 mint that will use this transfer hook
    pub mint: InterfaceAccount<'info, Mint>,

    /// The compliance policy to enforce on all transfers of this mint
    #[account(
        seeds = [POLICY_SEED, policy.institution.as_ref(), policy.policy_id.as_ref()],
        bump = policy.bump,
    )]
    pub policy: Account<'info, CompliancePolicy>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler_initialize_extra_account_meta_list(
    ctx: Context<InitializeExtraAccountMetaList>,
) -> Result<()> {
    // Define the extra accounts the transfer hook needs:
    // 1. Sender KYC attestation PDA — derived from ["kyc", institution, source_authority]
    // 2. Receiver KYC attestation PDA — derived from ["kyc", institution, destination_authority]
    // 3. Compliance policy account

    let extra_account_metas = vec![
        // Sender KYC attestation: seeds = ["kyc", policy.institution, source_owner]
        // source_owner is at index 2 in the standard transfer instruction accounts
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: KYC_SEED.to_vec(),
                },
                Seed::AccountKey { index: 5 }, // policy account -> institution pubkey field
                Seed::AccountKey { index: 0 }, // source (sender) token account owner
            ],
            false, // is_signer
            false, // is_writable
        )?,
        // Receiver KYC attestation: seeds = ["kyc", policy.institution, destination_owner]
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: KYC_SEED.to_vec(),
                },
                Seed::AccountKey { index: 5 }, // policy account -> institution pubkey
                Seed::AccountKey { index: 2 }, // destination token account owner
            ],
            false,
            false,
        )?,
        // Compliance policy — passed as a fixed account
        ExtraAccountMeta::new_with_pubkey(&ctx.accounts.policy.key(), false, false)?,
    ];

    // Allocate space for the ExtraAccountMetaList
    let account_size =
        ExtraAccountMetaList::size_of(extra_account_metas.len())? as usize;

    // Create the account
    let lamports = Rent::get()?.minimum_balance(account_size);
    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[u8]] = &[
        EXTRA_ACCOUNT_META_LIST_SEED,
        mint_key.as_ref(),
        &[ctx.bumps.extra_account_meta_list],
    ];

    anchor_lang::system_program::create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::CreateAccount {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.extra_account_meta_list.to_account_info(),
            },
            &[signer_seeds],
        ),
        lamports,
        account_size as u64,
        &crate::ID,
    )?;

    // Initialize the ExtraAccountMetaList data
    let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &extra_account_metas)?;

    Ok(())
}

/// The transfer hook handler called by Token-2022 on every transfer.
/// This acts as a passive compliance gate — if checks fail, the transfer is rolled back.
#[derive(Accounts)]
pub struct TransferHook<'info> {
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
}

pub fn handler_transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let policy = &ctx.accounts.compliance_policy;
    let sender_att = &ctx.accounts.sender_attestation;
    let receiver_att = &ctx.accounts.receiver_attestation;

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

    // Note: Travel Rule cannot be enforced in transfer hook mode because
    // the hook doesn't have access to the TravelRuleRecord PDA.
    // For transfers requiring Travel Rule compliance, use Mode A
    // (execute_compliant_transfer) instead.

    Ok(())
}
