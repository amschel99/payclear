import { eq, and } from "drizzle-orm";
import { createHash } from "crypto";
import { db } from "../db/client.js";
import { entities } from "../db/schema.js";
import { logAuditEvent } from "./audit.service.js";
import { keyManager } from "../utils/key-manager.js";
import { encryptEntityPii, decryptEntityPii } from "../utils/encryption.js";
import type { PiiFields } from "../utils/encryption.js";
import type { CreateEntityInput, UpdateEntityInput } from "../schemas/entity.schema.js";

export function hashKycData(data: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

/**
 * Extract PII fields from entity input for encryption.
 */
function extractPiiFields(input: CreateEntityInput): PiiFields {
  return {
    fullName: input.fullName,
    dateOfBirth: input.dateOfBirth,
    nationality: input.nationality,
    governmentIdType: input.governmentIdType,
    governmentIdHash: input.governmentIdHash,
    addressLine1: input.addressLine1,
    addressCity: input.addressCity,
    addressCountry: input.addressCountry,
  };
}

export async function createEntity(
  institutionId: string,
  input: CreateEntityInput,
  actor: string
) {
  // Extract PII and compute KYC hash from PLAINTEXT values (before encryption)
  const piiFields = extractPiiFields(input);
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

  // Encrypt PII fields using the institution's DEK
  const dek = await keyManager.getDek(institutionId);
  const encryptedPii = encryptEntityPii(piiFields, dek);

  const [entity] = await db
    .insert(entities)
    .values({
      institutionId,
      walletAddress: input.walletAddress,
      kycLevel: input.kycLevel,
      riskScore: input.riskScore,
      status: 1, // active
      fullName: encryptedPii.fullName,
      dateOfBirth: encryptedPii.dateOfBirth,
      nationality: encryptedPii.nationality,
      governmentIdType: encryptedPii.governmentIdType,
      governmentIdHash: encryptedPii.governmentIdHash,
      addressLine1: encryptedPii.addressLine1,
      addressCity: encryptedPii.addressCity,
      addressCountry: encryptedPii.addressCountry,
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
    // Only log non-PII metadata in audit trail
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

  if (!entity) return null;

  // Decrypt PII fields before returning
  const dek = await keyManager.getDek(institutionId);
  const encryptedPii: PiiFields = {
    fullName: entity.fullName,
    dateOfBirth: entity.dateOfBirth,
    nationality: entity.nationality,
    governmentIdType: entity.governmentIdType,
    governmentIdHash: entity.governmentIdHash,
    addressLine1: entity.addressLine1,
    addressCity: entity.addressCity,
    addressCountry: entity.addressCountry,
  };

  const decryptedPii = decryptEntityPii(encryptedPii, dek);

  return {
    ...entity,
    ...decryptedPii,
  };
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
