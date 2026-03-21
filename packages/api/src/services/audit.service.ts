import { db } from "../db/client.js";
import { auditLog } from "../db/schema.js";

export type AuditEventType =
  | "institution.created"
  | "entity.created"
  | "entity.updated"
  | "entity.revoked"
  | "entity.accepted_external"
  | "entity.verification_initiated"
  | "entity.verification_approved"
  | "entity.verification_rejected"
  | "entity.attestation_synced"
  | "policy.created"
  | "policy.updated"
  | "transfer.submitted"
  | "transfer.completed"
  | "transfer.failed"
  | "transfer.blocked"
  | "travel_rule.created"
  | "travel_rule.approved"
  | "trust_network.added"
  | "trust_network.removed"
  | "screening.cleared"
  | "screening.flagged"
  | "screening.blocked"
  | "webhook.created"
  | "webhook.deleted"
  | "zk_proof.verified"
  | "zk_proof.expired"
  | "zk_proof.revoked";

export async function logAuditEvent(params: {
  institutionId: string;
  eventType: AuditEventType;
  entityType: string;
  entityId?: string;
  actor: string;
  details?: Record<string, unknown>;
  txSignature?: string;
}) {
  await db.insert(auditLog).values({
    institutionId: params.institutionId,
    eventType: params.eventType,
    entityType: params.entityType,
    entityId: params.entityId,
    actor: params.actor,
    details: params.details,
    txSignature: params.txSignature,
  });
}
