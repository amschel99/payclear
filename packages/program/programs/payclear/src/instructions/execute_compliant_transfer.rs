use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::*;
use crate::errors::PayClearError;
use crate::state::*;

#[derive(Accounts)]
#[instruction(nonce: [u8; 32], amount: u64)]
pub struct ExecuteCompliantTransfer<'info> {
    /// The sender initiating the transfer
    #[account(mut)]
    pub sender: Signer<'info>,

    /// Sender's token account
    #[account(
        mut,
        token::mint = mint,
        token::authority = sender,
    )]
    pub sender_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Receiver's token account
    #[account(
        mut,
        token::mint = mint,
    )]
    pub receiver_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Token mint
    pub mint: InterfaceAccount<'info, Mint>,

    /// Sender's KYC attestation
    #[account(
        seeds = [KYC_SEED, sender_attestation.institution.as_ref(), sender.key().as_ref()],
        bump = sender_attestation.bump,
    )]
    pub sender_attestation: Account<'info, KycAttestation>,

    /// Receiver's KYC attestation
    #[account(
        seeds = [KYC_SEED, receiver_attestation.institution.as_ref(), receiver_wallet.key().as_ref()],
        bump = receiver_attestation.bump,
    )]
    pub receiver_attestation: Account<'info, KycAttestation>,

    /// The receiver's wallet (for PDA derivation)
    /// CHECK: Used only for attestation PDA derivation
    pub receiver_wallet: UncheckedAccount<'info>,

    /// Compliance policy to enforce
    #[account(
        seeds = [POLICY_SEED, compliance_policy.institution.as_ref(), compliance_policy.policy_id.as_ref()],
        bump = compliance_policy.bump,
        constraint = compliance_policy.active @ PayClearError::PolicyInactive,
    )]
    pub compliance_policy: Account<'info, CompliancePolicy>,

    /// Travel Rule record (optional — required if amount >= threshold)
    /// CHECK: Validated in handler if travel rule is required
    pub travel_rule_record: Option<Account<'info, TravelRuleRecord>>,

    /// Transfer record PDA to create
    #[account(
        init,
        payer = sender,
        space = 8 + TransferRecord::INIT_SPACE,
        seeds = [TRANSFER_SEED, nonce.as_ref()],
        bump,
    )]
    pub transfer_record: Account<'info, TransferRecord>,

    /// Registry for global state
    #[account(
        mut,
        seeds = [REGISTRY_SEED],
        bump = registry.bump,
        constraint = !registry.paused @ PayClearError::RegistryPaused,
    )]
    pub registry: Account<'info, Registry>,

    /// Token program (SPL Token or Token-2022)
    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ExecuteCompliantTransfer>, nonce: [u8; 32], amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let policy = &ctx.accounts.compliance_policy;
    let sender_att = &ctx.accounts.sender_attestation;
    let receiver_att = &ctx.accounts.receiver_attestation;

    // 1. Verify sender attestation is valid
    require!(sender_att.is_active(), PayClearError::AttestationNotActive);
    require!(
        !sender_att.is_expired(now),
        PayClearError::AttestationExpired
    );

    // 2. Verify receiver attestation is valid
    require!(
        receiver_att.is_active(),
        PayClearError::AttestationNotActive
    );
    require!(
        !receiver_att.is_expired(now),
        PayClearError::AttestationExpired
    );

    // 3. Check KYC levels meet policy minimum
    require!(
        sender_att.kyc_level >= policy.min_kyc_level,
        PayClearError::InsufficientKycLevel
    );
    require!(
        receiver_att.kyc_level >= policy.min_kyc_level,
        PayClearError::InsufficientKycLevel
    );

    // 4. Check risk scores within policy maximum
    require!(
        sender_att.risk_score <= policy.max_risk_score,
        PayClearError::RiskScoreTooHigh
    );
    require!(
        receiver_att.risk_score <= policy.max_risk_score,
        PayClearError::RiskScoreTooHigh
    );

    // 5. Check transfer amount limits
    if policy.max_transfer_amount > 0 {
        require!(
            amount <= policy.max_transfer_amount,
            PayClearError::TransferAmountExceeded
        );
    }

    // 6. Check Travel Rule requirement
    if amount >= policy.travel_rule_threshold && policy.travel_rule_threshold > 0 {
        let travel_rule = ctx
            .accounts
            .travel_rule_record
            .as_ref()
            .ok_or(PayClearError::TravelRuleRequired)?;

        require!(
            travel_rule.status == TRAVEL_RULE_APPROVED,
            PayClearError::TravelRuleNotApproved
        );

        // Verify travel rule record matches this transfer
        require!(
            travel_rule.transfer_nonce == nonce,
            PayClearError::TravelRuleMismatch
        );
        require!(
            travel_rule.amount == amount,
            PayClearError::TravelRuleMismatch
        );
        require!(
            travel_rule.token_mint == ctx.accounts.mint.key(),
            PayClearError::TravelRuleMismatch
        );
    }

    // 7. Execute the token transfer via CPI
    let decimals = ctx.accounts.mint.decimals;
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.sender_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.receiver_token_account.to_account_info(),
        authority: ctx.accounts.sender.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token_interface::transfer_checked(cpi_ctx, amount, decimals)?;

    // 8. Create transfer record
    let record = &mut ctx.accounts.transfer_record;
    record.nonce = nonce;
    record.sender = ctx.accounts.sender.key();
    record.receiver = ctx.accounts.receiver_wallet.key();
    record.mint = ctx.accounts.mint.key();
    record.amount = amount;
    record.compliance_policy = ctx.accounts.compliance_policy.key();
    record.travel_rule_record = ctx
        .accounts
        .travel_rule_record
        .as_ref()
        .map(|r| r.key())
        .unwrap_or_default();
    record.sender_risk_score = sender_att.risk_score;
    record.receiver_risk_score = receiver_att.risk_score;
    record.status = TRANSFER_STATUS_COMPLETED;
    record.timestamp = now;
    record.bump = ctx.bumps.transfer_record;

    // 9. Increment registry transfer count
    let registry = &mut ctx.accounts.registry;
    registry.transfer_count = registry
        .transfer_count
        .checked_add(1)
        .ok_or(PayClearError::ArithmeticOverflow)?;

    // 10. Emit event
    emit!(ComplianceTransferEvent {
        transfer_nonce: nonce,
        sender: ctx.accounts.sender.key(),
        receiver: ctx.accounts.receiver_wallet.key(),
        mint: ctx.accounts.mint.key(),
        amount,
        sender_risk_score: sender_att.risk_score,
        receiver_risk_score: receiver_att.risk_score,
        travel_rule_required: amount >= policy.travel_rule_threshold
            && policy.travel_rule_threshold > 0,
        timestamp: now,
    });

    Ok(())
}

// Events
#[event]
pub struct ComplianceTransferEvent {
    pub transfer_nonce: [u8; 32],
    pub sender: Pubkey,
    pub receiver: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub sender_risk_score: u8,
    pub receiver_risk_score: u8,
    pub travel_rule_required: bool,
    pub timestamp: i64,
}
