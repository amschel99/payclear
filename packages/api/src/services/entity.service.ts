import { eq, and } from "drizzle-orm";
import { createHash } from "crypto";
import { db } from "../db/client.js";
import { entities } from "../db/schema.js";
import { logAuditEvent } from "./audit.service.js";
import type { CreateEntityInput, UpdateEntityInput } from "../schemas/entity.schema.js";

export function hashKycData(data: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
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
