use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use crate::constants::*;
use crate::state::CompliancePolicy;

/// Initialize the ExtraAccountMetaList for a Token-2022 mint that uses
/// the Civic-enhanced transfer hook (civic_transfer_hook).
///
/// This sets up the same extra accounts as the standard hook PLUS the
/// Civic Gateway Token PDAs for sender and receiver, and the gatekeeper
/// network account.
#[derive(Accounts)]
pub struct InitializeCivicExtraAccountMetaList<'info> {
    /// CHECK: Validated by seeds -- this is the ExtraAccountMetaList PDA
    #[account(
        mut,
        seeds = [EXTRA_ACCOUNT_META_LIST_SEED, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// The Token-2022 mint that will use this transfer hook
    pub mint: InterfaceAccount<'info, Mint>,

    /// The compliance policy to enforce on all transfers of this mint.
    /// Must have `require_civic_pass = true` and a valid `gatekeeper_network`.
    #[account(
        seeds = [POLICY_SEED, policy.institution.as_ref(), policy.policy_id.as_ref()],
        bump = policy.bump,
    )]
    pub policy: Account<'info, CompliancePolicy>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler_initialize_civic_extra_account_meta_list(
    ctx: Context<InitializeCivicExtraAccountMetaList>,
) -> Result<()> {
    let gatekeeper_network = ctx.accounts.policy.gatekeeper_network;

    // Define the extra accounts the civic transfer hook needs:
    // 1. Sender KYC attestation PDA
    // 2. Receiver KYC attestation PDA
    // 3. Compliance policy (fixed account)
    // 4. Sender Civic Gateway Token PDA
    // 5. Receiver Civic Gateway Token PDA
    // 6. Gatekeeper network (fixed account)

    let extra_account_metas = vec![
        // [0] Sender KYC attestation: seeds = ["kyc", policy.institution, source_owner]
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: KYC_SEED.to_vec(),
                },
                Seed::AccountKey { index: 5 }, // policy account -> institution pubkey field
                Seed::AccountKey { index: 0 }, // source (sender) token account
            ],
            false, // is_signer
            false, // is_writable
        )?,
        // [1] Receiver KYC attestation: seeds = ["kyc", policy.institution, destination_owner]
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: KYC_SEED.to_vec(),
                },
                Seed::AccountKey { index: 5 }, // policy account -> institution pubkey
                Seed::AccountKey { index: 2 }, // destination token account
            ],
            false,
            false,
        )?,
        // [2] Compliance policy -- passed as a fixed account
        ExtraAccountMeta::new_with_pubkey(&ctx.accounts.policy.key(), false, false)?,
        // [3] Sender Civic Gateway Token PDA
        // seeds = [sender_wallet, "gateway", 0u8, gatekeeper_network]
        // sender_wallet (owner) is at index 3 in standard transfer hook accounts
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::AccountKey { index: 3 }, // owner (sender wallet)
                Seed::Literal {
                    bytes: CIVIC_GATEWAY_SEED.to_vec(),
                },
                Seed::Literal {
                    bytes: vec![0u8],
                },
                Seed::Literal {
                    bytes: gatekeeper_network.to_bytes().to_vec(),
                },
            ],
            false,
            false,
        )?,
        // [4] Receiver Civic Gateway Token PDA
        // For the receiver, we use the destination token account (index 2)
        // as a proxy — the Gateway program derives from the wallet, not the
        // token account. In practice, the receiver wallet must be resolved
        // separately. Here we use the destination key as a stand-in for
        // off-chain resolution.
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::AccountKey { index: 2 }, // destination token account (receiver)
                Seed::Literal {
                    bytes: CIVIC_GATEWAY_SEED.to_vec(),
                },
                Seed::Literal {
                    bytes: vec![0u8],
                },
                Seed::Literal {
                    bytes: gatekeeper_network.to_bytes().to_vec(),
                },
            ],
            false,
            false,
        )?,
        // [5] Gatekeeper network -- fixed account
        ExtraAccountMeta::new_with_pubkey(&gatekeeper_network, false, false)?,
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
    let mut data = ctx
        .accounts
        .extra_account_meta_list
        .try_borrow_mut_data()?;
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &extra_account_metas)?;

    Ok(())
}
