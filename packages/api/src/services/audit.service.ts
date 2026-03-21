import { db } from "../db/client.js";
import { auditLog } from "../db/schema.js";

export type AuditEventType =
  | "institution.created"
  | "entity.created"
  | "entity.updated"
  | "entity.revoked"
  | "policy.created"
  | "policy.updated"
  | "transfer.submitted"
  | "transfer.completed"
  | "transfer.failed"
  | "travel_rule.created"
  | "travel_rule.approved"
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
