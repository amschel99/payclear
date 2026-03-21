import { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { verifySumsubWebhook, type SumsubWebhookPayload } from "../services/sumsub/webhook.js";
import { processVerificationResult } from "../services/sumsub/verification.service.js";

export async function sumsubWebhookRoutes(app: FastifyInstance) {
  // Sumsub sends webhooks as POST with JSON body + HMAC signature header.
  // This route must NOT require institution auth — it's called by Sumsub's servers.

  // We need the raw body for signature verification
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      done(null, body);
    },
  );

  app.post("/v1/webhooks/sumsub", async (request, reply) => {
    const rawBody = request.body as string;
    const signature = request.headers["x-payload-digest"] as string | undefined;

    if (!signature) {
      return reply.status(401).send({ error: "Missing x-payload-digest header" });
    }

    // Verify webhook signature
    const isValid = verifySumsubWebhook(rawBody, signature, config.sumsub.webhookSecret);
    if (!isValid) {
      return reply.status(401).send({ error: "Invalid webhook signature" });
    }

    let payload: SumsubWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as SumsubWebhookPayload;
    } catch {
      return reply.status(400).send({ error: "Invalid JSON payload" });
    }

    app.log.info(
      { type: payload.type, applicantId: payload.applicantId, externalUserId: payload.externalUserId },
      "Received Sumsub webhook",
    );

    try {
      switch (payload.type) {
        case "applicantReviewed": {
          if (!payload.reviewResult) {
            return reply.status(400).send({ error: "Missing reviewResult in applicantReviewed event" });
          }

          await processVerificationResult(
            payload.applicantId,
            payload.externalUserId,
            payload.reviewResult,
            payload.levelName,
          );
          break;
        }

        case "applicantPending": {
          // Update review status to pending — no action needed beyond logging
          app.log.info(
            { applicantId: payload.applicantId },
            "Applicant pending review",
          );
          break;
        }

        case "applicantOnHold": {
          // Manual review needed — log for compliance team
          app.log.warn(
            { applicantId: payload.applicantId, externalUserId: payload.externalUserId },
            "Applicant on hold — manual review required",
          );
          break;
        }

        default: {
          app.log.info(
            { type: payload.type },
            "Unhandled Sumsub webhook event type",
          );
        }
      }
    } catch (err) {
      app.log.error(
        { err, applicantId: payload.applicantId },
        "Error processing Sumsub webhook",
      );
      return reply.status(500).send({ error: "Internal processing error" });
    }

    return reply.status(200).send({ success: true });
  });
}
