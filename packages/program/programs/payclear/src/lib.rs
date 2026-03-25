use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("71F2kpdL4ezapNYLGHFCxcBBLTfHyXqsA2BZ2YxKaR8e");

#[program]
pub mod payclear {
    use super::*;

    /// Initialize the global registry (one-time setup)
    pub fn initialize_registry(ctx: Context<InitializeRegistry>) -> Result<()> {
        instructions::initialize_registry::handler(ctx)
    }

    /// Register a new institution/VASP
    pub fn register_institution(
        ctx: Context<RegisterInstitution>,
        institution_id: [u8; 32],
        vasp_code: [u8; 16],
        jurisdiction: [u8; 2],
    ) -> Result<()> {
        instructions::register_institution::handler(ctx, institution_id, vasp_code, jurisdiction)
    }

    /// Create a KYC attestation for a wallet
    pub fn create_kyc_attestation(
        ctx: Context<CreateKycAttestation>,
        kyc_hash: [u8; 32],
        kyc_level: u8,
        risk_score: u8,
        expires_at: i64,
    ) -> Result<()> {
        instructions::create_kyc_attestation::handler(ctx, kyc_hash, kyc_level, risk_score, expires_at)
    }

    /// Revoke a KYC attestation
    pub fn revoke_kyc_attestation(ctx: Context<RevokeKycAttestation>) -> Result<()> {
        instructions::revoke_kyc_attestation::handler(ctx)
    }

    /// Update the risk score for a KYC attestation
    pub fn update_risk_score(ctx: Context<UpdateRiskScore>, new_risk_score: u8) -> Result<()> {
        instructions::update_risk_score::handler(ctx, new_risk_score)
    }

    /// Create or update a compliance policy
    pub fn set_compliance_policy(
        ctx: Context<SetCompliancePolicy>,
        params: PolicyParams,
    ) -> Result<()> {
        instructions::set_compliance_policy::handler(ctx, params)
    }

    /// Record Travel Rule data on-chain (hashes only)
    pub fn record_travel_rule(
        ctx: Context<RecordTravelRule>,
        transfer_nonce: [u8; 32],
        beneficiary_wallet: Pubkey,
        amount: u64,
        token_mint: Pubkey,
        originator_data_hash: [u8; 32],
        beneficiary_data_hash: [u8; 32],
    ) -> Result<()> {
        instructions::record_travel_rule::handler(
            ctx,
            transfer_nonce,
            beneficiary_wallet,
            amount,
            token_mint,
            originator_data_hash,
            beneficiary_data_hash,
        )
    }

    /// Beneficiary VASP approves a Travel Rule record
    pub fn approve_travel_rule(ctx: Context<ApproveTravelRule>) -> Result<()> {
        instructions::approve_travel_rule::handler(ctx)
    }

    /// Execute a compliance-gated token transfer (Mode A)
    pub fn execute_compliant_transfer(
        ctx: Context<ExecuteCompliantTransfer>,
        nonce: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        instructions::execute_compliant_transfer::handler(ctx, nonce, amount)
    }

    /// Initialize extra account meta list for Token-2022 transfer hook (Mode B setup)
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        instructions::transfer_hook::handler_initialize_extra_account_meta_list(ctx)
    }

    /// Transfer hook handler — called automatically by Token-2022 (Mode B)
    pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
        instructions::transfer_hook::handler_transfer_hook(ctx, amount)
    }

    // ─── Trust Network & KYC Portability ─────────────────────

    /// Add an institution to the caller's trust network.
    /// This declares that the calling institution is willing to accept
    /// KYC attestations issued by the trusted institution, subject to
    /// the specified minimum KYC level and jurisdiction constraints.
    pub fn add_trusted_institution(
        ctx: Context<AddTrustedInstitution>,
        min_accepted_kyc_level: u8,
        require_same_jurisdiction: bool,
    ) -> Result<()> {
        instructions::manage_trust_network::handler_add_trusted_institution(
            ctx,
            min_accepted_kyc_level,
            require_same_jurisdiction,
        )
    }

    /// Remove an institution from the caller's trust network.
    /// Note: This does NOT revoke any attestations that were previously
    /// accepted based on trust in the removed institution. Those remain
    /// valid until explicitly revoked — see module docs for rationale.
    pub fn remove_trusted_institution(
        ctx: Context<RemoveTrustedInstitution>,
        trusted_institution: Pubkey,
    ) -> Result<()> {
        instructions::manage_trust_network::handler_remove_trusted_institution(
            ctx,
            trusted_institution,
        )
    }

    /// Accept an external KYC attestation from a trusted institution.
    /// Creates a new attestation under the accepting institution that
    /// references the original, enabling cross-institution KYC portability
    /// without re-sharing PII.
    pub fn accept_external_attestation(
        ctx: Context<AcceptExternalAttestation>,
    ) -> Result<()> {
        instructions::accept_external_attestation::handler(ctx)
    }

    // ─── Civic Gateway Integration ───────────────────────────

    /// Initialize extra account meta list for Civic-enhanced transfer hook (Mode B + Civic)
    pub fn initialize_civic_extra_account_meta_list(
        ctx: Context<InitializeCivicExtraAccountMetaList>,
    ) -> Result<()> {
        instructions::initialize_civic_hook::handler_initialize_civic_extra_account_meta_list(ctx)
    }

    /// Civic-enhanced transfer hook — verifies Civic Gateway Tokens alongside PayClear attestations
    pub fn civic_transfer_hook(ctx: Context<CivicTransferHook>, amount: u64) -> Result<()> {
        instructions::civic_transfer_hook::handler_civic_transfer_hook(ctx, amount)
    }

    // ─── ZK Proof Integration (Reclaim Protocol) ─────────────

    /// Record a verified ZK proof from Reclaim Protocol on-chain
    pub fn record_zk_proof(
        ctx: Context<RecordZkProof>,
        proof_identifier: [u8; 32],
        provider: [u8; 32],
        kyc_level: u8,
        verified_at: i64,
        expires_at: i64,
        attestor: Pubkey,
    ) -> Result<()> {
        instructions::record_zk_proof::handler(
            ctx,
            proof_identifier,
            provider,
            kyc_level,
            verified_at,
            expires_at,
            attestor,
        )
    }

    /// Create or update a KYC attestation based on a verified ZK proof record
    pub fn verify_zk_attestation(ctx: Context<VerifyZkAttestation>) -> Result<()> {
        instructions::verify_zk_attestation::handler(ctx)
    }
}
