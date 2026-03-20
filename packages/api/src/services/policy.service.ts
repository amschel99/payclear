import { eq, and } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { db } from "../db/client.js";
import { compliancePolicies } from "../db/schema.js";
import { logAuditEvent } from "./audit.service.js";
import type { CreatePolicyInput, UpdatePolicyInput } from "../schemas/policy.schema.js";

export async function createPolicy(
  institutionId: string,
  input: CreatePolicyInput,
  actor: string
) {
  const policyId = createHash("sha256")
    .update(randomBytes(16))
    .digest("hex");

  const [policy] = await db
    .insert(compliancePolicies)
    .values({
      institutionId,
      policyId,
      name: input.name,
      minKycLevel: input.minKycLevel,
      maxRiskScore: input.maxRiskScore,
      travelRuleThreshold: BigInt(input.travelRuleThreshold),
      requireBothAttested: input.requireBothAttested,
      maxTransferAmount: BigInt(input.maxTransferAmount),
      dailyLimit: BigInt(input.dailyLimit),
      allowedJurisdictions: input.allowedJurisdictions,
      blockedJurisdictions: input.blockedJurisdictions,
    })
    .returning();

  await logAuditEvent({
    institutionId,
    eventType: "policy.created",
    entityType: "policy",
    entityId: policy.id,
    actor,
    details: { name: input.name },
  });

  return policy;
}

export async function getPolicy(id: string) {
  const [policy] = await db
    .select()
    .from(compliancePolicies)
    .where(eq(compliancePolicies.id, id));
  return policy ?? null;
}

export async function listPolicies(institutionId: string) {
  return db
    .select()
    .from(compliancePolicies)
    .where(eq(compliancePolicies.institutionId, institutionId));
}

export async function updatePolicy(
  id: string,
  updates: UpdatePolicyInput,
  institutionId: string,
  actor: string
) {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.name !== undefined) values.name = updates.name;
  if (updates.minKycLevel !== undefined) values.minKycLevel = updates.minKycLevel;
  if (updates.maxRiskScore !== undefined) values.maxRiskScore = updates.maxRiskScore;
  if (updates.travelRuleThreshold !== undefined)
    values.travelRuleThreshold = BigInt(updates.travelRuleThreshold);
  if (updates.requireBothAttested !== undefined)
    values.requireBothAttested = updates.requireBothAttested;
  if (updates.maxTransferAmount !== undefined)
    values.maxTransferAmount = BigInt(updates.maxTransferAmount);
  if (updates.dailyLimit !== undefined) values.dailyLimit = BigInt(updates.dailyLimit);
  if (updates.allowedJurisdictions !== undefined)
    values.allowedJurisdictions = updates.allowedJurisdictions;
  if (updates.blockedJurisdictions !== undefined)
    values.blockedJurisdictions = updates.blockedJurisdictions;

  const [updated] = await db
    .update(compliancePolicies)
    .set(values)
    .where(
      and(
        eq(compliancePolicies.id, id),
        eq(compliancePolicies.institutionId, institutionId)
      )
    )
    .returning();

  if (updated) {
    await logAuditEvent({
      institutionId,
      eventType: "policy.updated",
      entityType: "policy",
      entityId: id,
      actor,
      details: updates,
    });
  }

  return updated ?? null;
}
