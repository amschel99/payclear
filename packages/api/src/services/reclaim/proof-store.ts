import { eq, and } from "drizzle-orm";
import { db } from "../../db/client.js";
import { zkProofs, entities } from "../../db/schema.js";
import { logAuditEvent } from "../audit.service.js";

export interface StoreProofParams {
  institutionId: string;
  entityId?: string;
  walletAddress: string;
  proofIdentifier: string;
  provider: string;
  kycLevel: number;
  reclaimProofData: Record<string, unknown>;
  attestorId: string;
  verifiedAt: Date;
  expiresAt: Date;
  onchainAddress?: string;
}

/**
 * Store a verified Reclaim proof for audit trail and reference.
 */
export async function storeProof(
  params: StoreProofParams,
  actor: string
) {
  const [proof] = await db
    .insert(zkProofs)
    .values({
      institutionId: params.institutionId,
      entityId: params.entityId ?? null,
      walletAddress: params.walletAddress,
      proofIdentifier: params.proofIdentifier,
      provider: params.provider,
      kycLevel: params.kycLevel,
      reclaimProofData: params.reclaimProofData,
      attestorId: params.attestorId,
      status: "verified",
      verifiedAt: params.verifiedAt,
      expiresAt: params.expiresAt,
      onchainAddress: params.onchainAddress ?? null,
    })
    .returning();

  await logAuditEvent({
    institutionId: params.institutionId,
    eventType: "zk_proof.verified",
    entityType: "zk_proof",
    entityId: proof.id,
    actor,
    details: {
      proofIdentifier: params.proofIdentifier,
      provider: params.provider,
      kycLevel: params.kycLevel,
      walletAddress: params.walletAddress,
    },
  });

  return proof;
}

/**
 * Fetch all stored proofs for a given entity.
 */
export async function getProofsByEntity(entityId: string) {
  return db
    .select()
    .from(zkProofs)
    .where(eq(zkProofs.entityId, entityId));
}

/**
 * Fetch a proof by its unique Reclaim identifier.
 */
export async function getProofByIdentifier(proofIdentifier: string) {
  const [proof] = await db
    .select()
    .from(zkProofs)
    .where(eq(zkProofs.proofIdentifier, proofIdentifier));
  return proof ?? null;
}

/**
 * Fetch all proofs for a wallet address.
 */
export async function getProofsByWallet(walletAddress: string) {
  return db
    .select()
    .from(zkProofs)
    .where(eq(zkProofs.walletAddress, walletAddress));
}

/**
 * Update the on-chain address of a stored proof after recording on Solana.
 */
export async function updateProofOnchainAddress(
  proofId: string,
  onchainAddress: string
) {
  const [updated] = await db
    .update(zkProofs)
    .set({ onchainAddress })
    .where(eq(zkProofs.id, proofId))
    .returning();
  return updated ?? null;
}
