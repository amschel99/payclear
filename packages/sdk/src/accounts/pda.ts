import { PublicKey } from "@solana/web3.js";

const REGISTRY_SEED = Buffer.from("registry");
const INSTITUTION_SEED = Buffer.from("institution");
const KYC_SEED = Buffer.from("kyc");
const POLICY_SEED = Buffer.from("policy");
const TRAVEL_RULE_SEED = Buffer.from("travel_rule");
const TRANSFER_SEED = Buffer.from("transfer");
const EXTRA_ACCOUNT_META_LIST_SEED = Buffer.from("extra-account-metas");
const CIVIC_GATEWAY_SEED = Buffer.from("gateway");

export function deriveRegistryPDA(
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([REGISTRY_SEED], programId);
}

export function deriveInstitutionPDA(
  institutionId: Buffer,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [INSTITUTION_SEED, institutionId],
    programId
  );
}

export function deriveKycAttestationPDA(
  institution: PublicKey,
  wallet: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [KYC_SEED, institution.toBuffer(), wallet.toBuffer()],
    programId
  );
}

export function derivePolicyPDA(
  institution: PublicKey,
  policyId: Buffer,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POLICY_SEED, institution.toBuffer(), policyId],
    programId
  );
}

export function deriveTravelRulePDA(
  nonce: Buffer,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TRAVEL_RULE_SEED, nonce],
    programId
  );
}

export function deriveTransferPDA(
  nonce: Buffer,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TRANSFER_SEED, nonce],
    programId
  );
}

export function deriveExtraAccountMetaListPDA(
  mint: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [EXTRA_ACCOUNT_META_LIST_SEED, mint.toBuffer()],
    programId
  );
}

/**
 * Derive the Civic Gateway Token PDA for a given wallet and gatekeeper network.
 *
 * The Civic Gateway protocol derives token PDAs using:
 *   seeds = [wallet, "gateway", 0u8, gatekeeper_network]
 *
 * @param wallet - The wallet public key that holds the Civic Pass
 * @param gatekeeperNetwork - The gatekeeper network public key
 * @param gatewayProgramId - The Civic Gateway program ID
 */
export function deriveCivicGatewayTokenPDA(
  wallet: PublicKey,
  gatekeeperNetwork: PublicKey,
  gatewayProgramId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      wallet.toBuffer(),
      CIVIC_GATEWAY_SEED,
      Buffer.from([0]),
      gatekeeperNetwork.toBuffer(),
    ],
    gatewayProgramId
  );
}
