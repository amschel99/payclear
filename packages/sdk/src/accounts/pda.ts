import { PublicKey } from "@solana/web3.js";

const REGISTRY_SEED = Buffer.from("registry");
const INSTITUTION_SEED = Buffer.from("institution");
const KYC_SEED = Buffer.from("kyc");
const POLICY_SEED = Buffer.from("policy");
const TRAVEL_RULE_SEED = Buffer.from("travel_rule");
const TRANSFER_SEED = Buffer.from("transfer");
const EXTRA_ACCOUNT_META_LIST_SEED = Buffer.from("extra-account-metas");
const ZK_PROOF_SEED = Buffer.from("zk_proof");

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

export function deriveZkProofPDA(
  institution: PublicKey,
  wallet: PublicKey,
  proofIdentifier: Buffer,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ZK_PROOF_SEED, institution.toBuffer(), wallet.toBuffer(), proofIdentifier],
    programId
  );
}
