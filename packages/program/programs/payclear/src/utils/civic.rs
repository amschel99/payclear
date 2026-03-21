use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::PayClearError;

/// Gateway Token account data layout (Civic Gateway Protocol):
///   [0]       features   (1 byte)
///   [1]       state      (1 byte) — 0=Active, 1=Revoked, 2=Frozen
///   [2..34]   gatekeeper_network (32 bytes)
///   [34..66]  owner / issuing gatekeeper (32 bytes)
///   [66..74]  expire_time (i64, little-endian, optional — 0 means no expiry)
const GATEWAY_TOKEN_FEATURES_OFFSET: usize = 0;
const GATEWAY_TOKEN_STATE_OFFSET: usize = 1;
const GATEWAY_TOKEN_NETWORK_OFFSET: usize = 2;
const GATEWAY_TOKEN_OWNER_OFFSET: usize = 34;
const GATEWAY_TOKEN_EXPIRE_OFFSET: usize = 66;
const GATEWAY_TOKEN_MIN_SIZE: usize = 66;
const GATEWAY_TOKEN_SIZE_WITH_EXPIRY: usize = 74;

/// Verify that a Civic Gateway Token is valid and active.
///
/// Checks:
/// 1. The account exists (has data)
/// 2. PDA derivation matches `[wallet, "gateway", 0u8, gatekeeper_network]`
/// 3. The `state` byte is Active (0)
/// 4. The `gatekeeper_network` field matches the expected network
/// 5. If an expiry is present, it has not passed
pub fn verify_civic_gateway_token(
    account_info: &AccountInfo,
    wallet: &Pubkey,
    gatekeeper_network: &Pubkey,
) -> Result<bool> {
    // Check the account has data
    let data = account_info.try_borrow_data()?;
    if data.len() < GATEWAY_TOKEN_MIN_SIZE {
        return Err(PayClearError::CivicPassNotFound.into());
    }

    // Verify PDA derivation: seeds = [wallet, "gateway", 0u8, gatekeeper_network]
    let expected_seeds: &[&[u8]] = &[
        wallet.as_ref(),
        CIVIC_GATEWAY_SEED,
        &[0u8],
        gatekeeper_network.as_ref(),
    ];

    // The Civic Gateway program uses a known program ID for PDA derivation.
    // We verify the PDA matches without needing the program ID by checking
    // the account key derives from the expected seeds with some bump.
    // We iterate possible bumps (255..0) to find a match.
    let mut pda_valid = false;
    for bump in (0..=255u8).rev() {
        let seeds_with_bump: &[&[u8]] = &[
            wallet.as_ref(),
            CIVIC_GATEWAY_SEED,
            &[0u8],
            gatekeeper_network.as_ref(),
            &[bump],
        ];
        if let Ok(derived) = Pubkey::create_program_address(
            seeds_with_bump,
            account_info.owner,
        ) {
            if derived == *account_info.key {
                pda_valid = true;
                break;
            }
        }
    }

    if !pda_valid {
        return Err(PayClearError::CivicPassNotFound.into());
    }

    // Check state
    let state = data[GATEWAY_TOKEN_STATE_OFFSET];
    if state != CIVIC_GATEWAY_STATE_ACTIVE {
        return Err(PayClearError::CivicPassNotActive.into());
    }

    // Verify the gatekeeper network stored in the token matches expected
    let stored_network = Pubkey::try_from(
        &data[GATEWAY_TOKEN_NETWORK_OFFSET..GATEWAY_TOKEN_OWNER_OFFSET],
    )
    .map_err(|_| PayClearError::InvalidGatekeeperNetwork)?;

    if stored_network != *gatekeeper_network {
        return Err(PayClearError::InvalidGatekeeperNetwork.into());
    }

    // Check expiry if present
    if data.len() >= GATEWAY_TOKEN_SIZE_WITH_EXPIRY {
        let expire_bytes: [u8; 8] = data
            [GATEWAY_TOKEN_EXPIRE_OFFSET..GATEWAY_TOKEN_SIZE_WITH_EXPIRY]
            .try_into()
            .unwrap();
        let expire_time = i64::from_le_bytes(expire_bytes);

        if expire_time > 0 {
            let now = Clock::get()?.unix_timestamp;
            if now > expire_time {
                return Err(PayClearError::CivicPassExpired.into());
            }
        }
    }

    Ok(true)
}
