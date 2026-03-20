use anchor_lang::prelude::*;

/// Maximum number of institutions that can be in a single trust network.
/// This cap prevents unbounded account growth and keeps rent costs predictable.
/// 32 pubkeys * 32 bytes = 1024 bytes — well within Solana's 10 KB account limit.
pub const MAX_TRUSTED_INSTITUTIONS: usize = 32;

/// A trust network defines which other institutions' KYC attestations an
/// institution is willing to accept for cross-institutional portability.
///
/// **Design decisions:**
///
/// 1. Trust is unidirectional: Institution A trusting Institution B does NOT
///    imply the reverse. This mirrors real-world correspondent banking
///    relationships and regulatory reality.
///
/// 2. Removing an institution from the trust network does NOT retroactively
///    invalidate attestations that were already accepted based on that trust
///    relationship. Accepted attestations are first-class attestations under
///    the accepting institution — revocation is a separate, deliberate action.
///    This prevents cascading disruptions in production payment flows.
///
/// 3. `min_accepted_kyc_level` sets a floor: an external attestation must meet
///    at least this KYC level to be eligible for acceptance. An institution
///    performing enhanced due diligence (level 2) won't accept basic (level 1)
///    attestations from peers.
///
/// 4. `require_same_jurisdiction` is a regulatory safeguard. When true, only
///    attestations from institutions in the same jurisdiction can be accepted.
///    This handles cases where cross-border KYC portability isn't legally
///    permitted.
#[account]
#[derive(InitSpace)]
pub struct TrustNetwork {
    /// The institution that owns this trust network
    pub institution: Pubkey,

    /// List of institution pubkeys whose attestations this institution trusts.
    /// Uses a fixed-size array to keep Anchor's InitSpace derivation deterministic.
    #[max_len(32)]
    pub trusted_institutions: Vec<Pubkey>,

    /// Minimum KYC level required from external attestations (0-3).
    /// External attestations below this level will be rejected during acceptance.
    pub min_accepted_kyc_level: u8,

    /// When true, only attestations from institutions in the same jurisdiction
    /// as this institution can be accepted. Jurisdiction is checked at
    /// acceptance time against the Institution account's `jurisdiction` field.
    pub require_same_jurisdiction: bool,

    /// PDA bump seed
    pub bump: u8,
}
