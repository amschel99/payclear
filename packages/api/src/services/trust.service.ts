import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { trustNetwork, entities, institutions } from "../db/schema.js";
import { logAuditEvent } from "./audit.service.js";

// ─── Trust Network Management ─────────────────────────────────

export async function addTrustedInstitution(
  institutionId: string,
  trustedInstitutionId: string,
  minKycLevel: number,
  requireSameJurisdiction: boolean,
  actor: string
) {
  // Prevent self-trust
  if (institutionId === trustedInstitutionId) {
    throw new Error("An institution cannot add itself to its own trust network");
  }

  // Verify the trusted institution exists
  const [trustedInst] = await db
    .select()
    .from(institutions)
    .where(eq(institutions.id, trustedInstitutionId));

  if (!trustedInst) {
    throw new Error("Trusted institution not found");
  }

  if (!trustedInst.active) {
    throw new Error("Trusted institution is not active");
  }

  const [record] = await db
    .insert(trustNetwork)
    .values({
      institutionId,
      trustedInstitutionId,
      minKycLevel,
      requireSameJurisdiction,
    })
    .returning();

  await logAuditEvent({
    institutionId,
    eventType: "trust_network.added",
    entityType: "trust_network",
    entityId: record.id,
    actor,
    details: {
      trustedInstitutionId,
      trustedInstitutionName: trustedInst.name,
      minKycLevel,
      requireSameJurisdiction,
    },
  });

  return record;
}

export async function removeTrustedInstitution(
  institutionId: string,
  trustedInstitutionId: string,
  actor: string
) {
  const [deleted] = await db
    .delete(trustNetwork)
    .where(
      and(
        eq(trustNetwork.institutionId, institutionId),
        eq(trustNetwork.trustedInstitutionId, trustedInstitutionId)
      )
    )
    .returning();

  if (!deleted) {
    return null;
  }

  // Note: We intentionally do NOT revoke any entities that were previously
  // accepted from this trusted institution. Accepted entities are first-class
  // records owned by the accepting institution. Revocation of those entities
  // must be done explicitly via the entity revocation endpoint. This prevents
  // cascading disruptions when trust relationships change.
  await logAuditEvent({
    institutionId,
    eventType: "trust_network.removed",
    entityType: "trust_network",
    entityId: deleted.id,
    actor,
    details: { trustedInstitutionId },
  });

  return deleted;
}

export async function listTrustedInstitutions(institutionId: string) {
  const records = await db
    .select({
      id: trustNetwork.id,
      trustedInstitutionId: trustNetwork.trustedInstitutionId,
      trustedInstitutionName: institutions.name,
      trustedInstitutionJurisdiction: institutions.jurisdiction,
      minKycLevel: trustNetwork.minKycLevel,
      requireSameJurisdiction: trustNetwork.requireSameJurisdiction,
      createdAt: trustNetwork.createdAt,
    })
    .from(trustNetwork)
    .innerJoin(
      institutions,
      eq(trustNetwork.trustedInstitutionId, institutions.id)
    )
    .where(eq(trustNetwork.institutionId, institutionId));

  return records;
}

// ─── Accept External Attestation ────────────────────────────────

export interface AcceptExternalAttestationInput {
  walletAddress: string;
  externalInstitutionId: string;
}

/**
 * Accepts an external KYC attestation from a trusted institution.
 *
 * This creates a local entity record that mirrors the external entity's KYC
 * data, with provenance fields set to track the original institution and entity.
 *
 * **Design decisions:**
 *
 * 1. The PII fields (fullName, dateOfBirth, etc.) are NOT copied from the
 *    external entity. KYC portability is about recognizing the attestation,
 *    not sharing PII. The accepting institution gets the KYC level, risk score,
 *    and hash — enough to make a trust decision.
 *
 * 2. If the original entity is later revoked by its issuing institution, the
 *    accepted entity here remains valid. The accepting institution made its own
 *    trust decision, and must explicitly revoke if warranted. This prevents
 *    cascading failures in production payment networks.
 *
 * 3. The kycHash IS copied because it allows the accepting institution to
 *    verify identity consistency without accessing the underlying PII.
 */
export async function acceptExternalAttestation(
  acceptingInstitutionId: string,
  input: AcceptExternalAttestationInput,
  actor: string
) {
  // 1. Verify trust relationship exists
  const [trustRecord] = await db
    .select()
    .from(trustNetwork)
    .where(
      and(
        eq(trustNetwork.institutionId, acceptingInstitutionId),
        eq(trustNetwork.trustedInstitutionId, input.externalInstitutionId)
      )
    );

  if (!trustRecord) {
    throw new Error(
      "External institution is not in your trust network. Add it first via POST /v1/trust-network."
    );
  }

  // 2. Fetch the external entity
  const [externalEntity] = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.institutionId, input.externalInstitutionId),
        eq(entities.walletAddress, input.walletAddress)
      )
    );

  if (!externalEntity) {
    throw new Error(
      "No entity found for this wallet under the external institution"
    );
  }

  // 3. Verify external entity is active (status 1)
  if (externalEntity.status !== 1) {
    throw new Error(
      "External entity is not active (status: " + externalEntity.status + ")"
    );
  }

  // 4. Verify KYC level meets minimum requirement
  if (externalEntity.kycLevel < trustRecord.minKycLevel) {
    throw new Error(
      `External entity KYC level (${externalEntity.kycLevel}) is below the ` +
        `minimum accepted level (${trustRecord.minKycLevel})`
    );
  }

  // 5. If jurisdiction check required, verify both institutions match
  if (trustRecord.requireSameJurisdiction) {
    const [acceptingInst] = await db
      .select()
      .from(institutions)
      .where(eq(institutions.id, acceptingInstitutionId));

    const [externalInst] = await db
      .select()
      .from(institutions)
      .where(eq(institutions.id, input.externalInstitutionId));

    if (
      acceptingInst &&
      externalInst &&
      acceptingInst.jurisdiction !== externalInst.jurisdiction
    ) {
      throw new Error(
        `Jurisdiction mismatch: accepting institution (${acceptingInst.jurisdiction}) ` +
          `differs from external institution (${externalInst.jurisdiction})`
      );
    }
  }

  // 6. Check if entity already exists for this wallet under accepting institution
  const [existing] = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.institutionId, acceptingInstitutionId),
        eq(entities.walletAddress, input.walletAddress)
      )
    );

  if (existing) {
    throw new Error(
      "An entity already exists for this wallet under your institution. " +
        "Use PATCH /v1/entities/:wallet to update it instead."
    );
  }

  // 7. Create accepted entity — no PII is copied, only attestation metadata
  const [entity] = await db
    .insert(entities)
    .values({
      institutionId: acceptingInstitutionId,
      walletAddress: input.walletAddress,
      kycLevel: externalEntity.kycLevel,
      riskScore: externalEntity.riskScore,
      status: 1, // active
      kycHash: externalEntity.kycHash,
      expiresAt: externalEntity.expiresAt,
      originalInstitutionId: input.externalInstitutionId,
      originalEntityId: externalEntity.id,
    })
    .returning();

  await logAuditEvent({
    institutionId: acceptingInstitutionId,
    eventType: "entity.accepted_external",
    entityType: "entity",
    entityId: entity.id,
    actor,
    details: {
      walletAddress: input.walletAddress,
      externalInstitutionId: input.externalInstitutionId,
      originalEntityId: externalEntity.id,
      kycLevel: externalEntity.kycLevel,
      riskScore: externalEntity.riskScore,
    },
  });

  return {
    entity,
    originalInstitutionId: input.externalInstitutionId,
    originalEntityId: externalEntity.id,
  };
}
