import { db } from "../db/client.js";
import { auditLog } from "../db/schema.js";
import { dispatchWebhookEvent } from "./webhook.service.js";

/** Event types that should trigger webhook dispatch */
const WEBHOOK_EVENT_TYPES = new Set([
  "transfer.submitted",
  "transfer.completed",
  "transfer.failed",
  "transfer.blocked",
  "institution.created",
  "travel_rule.created",
  "travel_rule.approved",
]);

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

  // Dispatch webhook for key compliance events
  if (WEBHOOK_EVENT_TYPES.has(params.eventType)) {
    dispatchWebhookEvent(params.institutionId, params.eventType, {
      eventType: params.eventType,
      entityType: params.entityType,
      entityId: params.entityId,
      actor: params.actor,
      details: params.details,
      txSignature: params.txSignature,
      timestamp: new Date().toISOString(),
    }).catch((err) => {
      // Log but don't fail the audit event if webhook dispatch fails
      console.error("Failed to dispatch webhook event:", err);
    });
  }
}
