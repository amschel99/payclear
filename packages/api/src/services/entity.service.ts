import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { entities } from "../db/schema.js";
import { logAuditEvent } from "./audit.service.js";
import type { CreateEntityInput, UpdateEntityInput } from "../schemas/entity.schema.js";
import {
  buildKycMerkleTree,
  getMerkleRoot,
  generateProof,
  hashLeaf,
  type KycFieldMap,
} from "./merkle-bridge.js";

/**
 * Collect the KYC field map from a CreateEntityInput.
 *
 * Only fields that have a defined, non-empty value are included.  The field
 * names must match the canonical KYC field schema so the Merkle tree is
 * compatible with the SDK's verifier.
 */
function buildKycFieldMap(
  input: CreateEntityInput,
  institutionId: string
): KycFieldMap {
  const fields: KycFieldMap = {};

  // Public fields
  fields.kycLevel = String(input.kycLevel);
  if (input.addressCountry) fields.jurisdiction = input.addressCountry;
  // entityType is not currently part of CreateEntityInput; include if provided
  fields.attestingInstitution = institutionId;

  // Private fields — only include if present
  if (input.fullName) fields.fullName = input.fullName;
  if (input.dateOfBirth) fields.dateOfBirth = input.dateOfBirth;
  if (input.nationality) fields.nationality = input.nationality;
  if (input.governmentIdType) fields.governmentIdType = input.governmentIdType;
  if (input.governmentIdHash) fields.governmentIdHash = input.governmentIdHash;
  if (input.addressLine1) fields.addressLine1 = input.addressLine1;
  if (input.addressCity) fields.addressCity = input.addressCity;
  if (input.addressCountry) fields.addressCountry = input.addressCountry;

  return fields;
}

/**
 * Build a map of { fieldName: hexLeafHash } for persistent storage.
 *
 * Stored alongside the entity so we can regenerate Merkle proofs without
 * needing the raw PII values (though the raw values are also stored in the
 * entity record for the institution's own use).
 */
function buildMerkleLeafMap(fields: KycFieldMap): Record<string, string> {
  const leafMap: Record<string, string> = {};
  for (const [name, value] of Object.entries(fields)) {
    leafMap[name] = hashLeaf(name, value).toString("hex");
  }
  return leafMap;
}

export async function createEntity(
  institutionId: string,
  input: CreateEntityInput,
  actor: string
) {
  // Build the Merkle tree from canonical KYC fields
  const kycFields = buildKycFieldMap(input, institutionId);
  const tree = buildKycMerkleTree(kycFields);
  const kycHash = getMerkleRoot(tree).toString("hex");
  const merkleLeaves = buildMerkleLeafMap(kycFields);

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
      merkleLeaves,
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

/**
 * Generate a Merkle selective disclosure proof for an entity.
 *
 * Retrieves the entity, reconstructs the KYC field map from the stored
 * data, builds the Merkle tree, and generates inclusion proofs for the
 * requested field names.
 *
 * @param institutionId - The institution's UUID.
 * @param walletAddress - The wallet address of the entity.
 * @param fieldNames - The canonical field names to disclose.
 * @returns The Merkle proof and disclosed field values, or null if the entity
 *          is not found.
 * @throws If any requested field is not present in the entity's Merkle tree.
 */
export async function generateDisclosureProof(
  institutionId: string,
  walletAddress: string,
  fieldNames: string[]
) {
  const entity = await getEntity(institutionId, walletAddress);
  if (!entity) return null;

  // Reconstruct the KYC field map from stored entity data
  const kycFields: KycFieldMap = {};

  // Public fields
  kycFields.kycLevel = String(entity.kycLevel);
  if (entity.addressCountry) kycFields.jurisdiction = entity.addressCountry;
  kycFields.attestingInstitution = entity.institutionId;

  // Private fields
  if (entity.fullName) kycFields.fullName = entity.fullName;
  if (entity.dateOfBirth) kycFields.dateOfBirth = entity.dateOfBirth;
  if (entity.nationality) kycFields.nationality = entity.nationality;
  if (entity.governmentIdType) kycFields.governmentIdType = entity.governmentIdType;
  if (entity.governmentIdHash) kycFields.governmentIdHash = entity.governmentIdHash;
  if (entity.addressLine1) kycFields.addressLine1 = entity.addressLine1;
  if (entity.addressCity) kycFields.addressCity = entity.addressCity;
  if (entity.addressCountry) kycFields.addressCountry = entity.addressCountry;

  // Build tree and generate proof
  const tree = buildKycMerkleTree(kycFields);
  const root = getMerkleRoot(tree);
  const proof = generateProof(tree, fieldNames);

  // Collect disclosed values
  const disclosedFields: KycFieldMap = {};
  for (const name of fieldNames) {
    if (kycFields[name] === undefined) {
      throw new Error(
        `Field "${name}" is not present in this entity's KYC data.`
      );
    }
    disclosedFields[name] = kycFields[name];
  }

  // Serialize proof for JSON transport
  const serializedProof = {
    root: root.toString("hex"),
    items: proof.items.map((item) => ({
      fieldName: item.fieldName,
      fieldValue: item.fieldValue,
      leafHash: item.leafHash.toString("hex"),
      siblings: item.siblings.map((s) => ({
        hash: s.hash.toString("hex"),
        position: s.position,
      })),
    })),
  };

  return {
    walletAddress: entity.walletAddress,
    merkleRoot: root.toString("hex"),
    disclosedFields,
    proof: serializedProof,
  };
}
