import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { entities } from "../db/schema.js";
import { logAuditEvent } from "./audit.service.js";
import {
  hashKycCanonicalHex,
  HASH_VERSION,
} from "../utils/canonical.js";
import type { CreateEntityInput, UpdateEntityInput } from "../schemas/entity.schema.js";

/**
 * Compute a deterministic, versioned SHA-256 hash of KYC data.
 *
 * Uses RFC 8785 canonical JSON serialization so that key ordering is
 * irrelevant — the same logical data always produces the same hash.
 * The hash is versioned (currently v{@link HASH_VERSION}) so that
 * future changes to the field set produce distinct digests rather than
 * silently breaking verification of existing attestations.
 *
 * @param data - A record containing KYC fields (extra keys are ignored).
 * @returns A 64-character lowercase hex-encoded SHA-256 digest.
 */
export function hashKycData(data: Record<string, unknown>): string {
  return hashKycCanonicalHex(data);
}

export async function createEntity(
  institutionId: string,
  input: CreateEntityInput,
  actor: string
) {
  const kycData = {
    fullName: input.fullName,
    dateOfBirth: input.dateOfBirth,
    nationality: input.nationality,
    governmentIdType: input.governmentIdType,
    governmentIdHash: input.governmentIdHash,
    addressLine1: input.addressLine1,
    addressCity: input.addressCity,
    addressCountry: input.addressCountry,
  };
  const kycHash = hashKycData(kycData);

  const [entity] = await db
    .insert(entities)
    .values({
      institutionId,
      walletAddress: input.walletAddress,
      kycLevel: input.kycLevel,
      riskScore: input.riskScore,
      status: 1, // active
      fullName: input.fullName,
      dateOfBirth: input.dateOfBirth,
      nationality: input.nationality,
      governmentIdType: input.governmentIdType,
      governmentIdHash: input.governmentIdHash,
      addressLine1: input.addressLine1,
      addressCity: input.addressCity,
      addressCountry: input.addressCountry,
      kycHash,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    })
    .returning();

  await logAuditEvent({
    institutionId,
    eventType: "entity.created",
    entityType: "entity",
    entityId: entity.id,
    actor,
    details: { walletAddress: input.walletAddress, kycLevel: input.kycLevel },
  });

  return { entity, kycHash };
}

export async function getEntity(institutionId: string, walletAddress: string) {
  const [entity] = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.institutionId, institutionId),
        eq(entities.walletAddress, walletAddress)
      )
    );
  return entity ?? null;
}

export async function updateEntity(
  institutionId: string,
  walletAddress: string,
  updates: UpdateEntityInput,
  actor: string
) {
  const [updated] = await db
    .update(entities)
    .set({ ...updates, updatedAt: new Date() })
    .where(
      and(
        eq(entities.institutionId, institutionId),
        eq(entities.walletAddress, walletAddress)
      )
    )
    .returning();

  if (updated) {
    await logAuditEvent({
      institutionId,
      eventType: updates.status === 3 ? "entity.revoked" : "entity.updated",
      entityType: "entity",
      entityId: updated.id,
      actor,
      details: updates,
    });
  }

  return updated ?? null;
}
