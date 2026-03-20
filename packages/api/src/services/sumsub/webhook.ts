import { createHmac } from "crypto";
import type { SumsubReviewResult } from "./client.js";

// ─── Types ──────────────────────────────────────────────────

export type SumsubWebhookEventType =
  | "applicantReviewed"
  | "applicantPending"
  | "applicantOnHold"
  | "applicantCreated"
  | "applicantPersonalInfoChanged";

export interface SumsubWebhookPayload {
  /** Sumsub applicant ID */
  applicantId: string;

  /** Inspection ID for this review cycle */
  inspectionId: string;

  /** Correlation ID for tracking */
  correlationId: string;

  /** External user ID (maps to wallet address in PayClear) */
  externalUserId: string;

  /** Webhook event type */
  type: SumsubWebhookEventType;

  /** Review result, present on applicantReviewed events */
  reviewResult?: SumsubReviewResult;

  /** Review status string */
  reviewStatus?: string;

  /** Sumsub level name used for this verification */
  levelName?: string;

  /** ISO timestamp of the event */
  createdAt: string;

  /** Sandbox mode flag */
  sandboxMode?: boolean;
}

// ─── Signature Verification ──────────────────────────────────

/**
 * Verify the HMAC-SHA256 digest sent by Sumsub in the webhook request header.
 *
 * Sumsub signs the raw body with HMAC-SHA256 using the webhook secret key.
 * The resulting hex digest is sent in the `x-payload-digest` header.
 */
export function verifySumsubWebhook(
  payload: string | Buffer,
  signature: string,
  secretKey: string,
): boolean {
  const expected = createHmac("sha256", secretKey)
    .update(payload)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}
