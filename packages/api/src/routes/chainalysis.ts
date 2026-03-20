/**
 * Chainalysis KYT Routes
 *
 * Webhook receiver, on-demand wallet screening, and per-transfer risk queries.
 */

import { FastifyInstance } from "fastify";
import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.js";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { screeningResults, transfers } from "../db/schema.js";
import * as riskService from "../services/chainalysis/risk.service.js";
import type { Alert } from "../services/chainalysis/client.js";

export async function chainalysisRoutes(app: FastifyInstance) {
  // ─── Webhook (no auth middleware — uses HMAC verification) ──

  app.post("/v1/webhooks/chainalysis", {
    config: { rawBody: true },
    handler: async (request, reply) => {
      const signature = request.headers["x-chainalysis-signature"] as
        | string
        | undefined;

      if (!signature) {
        return reply.status(401).send({ error: "Missing webhook signature" });
      }

      // Verify HMAC-SHA256 signature
      const rawBody =
        typeof request.body === "string"
          ? request.body
          : JSON.stringify(request.body);

      const expectedSig = createHmac(
        "sha256",
        config.chainalysis.webhookSecret
      )
        .update(rawBody)
        .digest("hex");

      const sigBuffer = Buffer.from(signature, "hex");
      const expectedBuffer = Buffer.from(expectedSig, "hex");

      if (
        sigBuffer.length !== expectedBuffer.length ||
        !timingSafeEqual(sigBuffer, expectedBuffer)
      ) {
        return reply.status(401).send({ error: "Invalid webhook signature" });
      }

      // Process alert
      const alert = request.body as Alert;
      try {
        await riskService.processAlert(alert);
        return reply.status(200).send({ received: true });
      } catch (err) {
        request.log.error(err, "Failed to process Chainalysis alert");
        return reply
          .status(500)
          .send({ error: "Failed to process alert" });
      }
    },
  });

  // ─── Authenticated Screening Routes ────────────────────────

  app.register(async (authedApp) => {
    authedApp.addHook("onRequest", authMiddleware);

    // On-demand wallet screening
    authedApp.get<{ Params: { wallet: string } }>(
      "/v1/screening/:wallet",
      async (request, reply) => {
        const { wallet } = request.params;
        const inst = request.institution!;

        try {
          const result = await riskService.screenWalletAddress(
            wallet,
            inst.id
          );
          return reply.send({
            wallet: result.walletAddress,
            riskScore: result.riskScore,
            rating: result.rating,
            exposures: result.exposures,
            externalId: result.externalId,
            screeningId: result.screeningId,
          });
        } catch (err) {
          request.log.error(err, `Wallet screening failed for ${wallet}`);
          return reply
            .status(502)
            .send({ error: "Screening provider unavailable" });
        }
      }
    );

    // Get risk assessment for a specific transfer
    authedApp.get<{ Params: { nonce: string } }>(
      "/v1/transfers/:nonce/risk",
      async (request, reply) => {
        const { nonce } = request.params;

        // Find the transfer
        const [transfer] = await db
          .select()
          .from(transfers)
          .where(eq(transfers.nonce, nonce));

        if (!transfer) {
          return reply.status(404).send({ error: "Transfer not found" });
        }

        // Find associated screening results
        if (!transfer.screeningId) {
          return reply.send({
            nonce,
            screeningStatus: transfer.screeningStatus ?? "none",
            screening: null,
          });
        }

        const [screening] = await db
          .select()
          .from(screeningResults)
          .where(eq(screeningResults.id, transfer.screeningId));

        return reply.send({
          nonce,
          screeningStatus: transfer.screeningStatus,
          screening: screening
            ? {
                id: screening.id,
                provider: screening.provider,
                rating: screening.rating,
                riskScore: screening.riskScore,
                rawScore: screening.rawScore,
                exposures: screening.exposures,
                screenedAt: screening.screenedAt,
              }
            : null,
        });
      }
    );
  });
}
