import { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import { submitTransferSchema } from "../schemas/transfer.schema.js";
import * as transferService from "../services/transfer.service.js";

export async function transferRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authMiddleware);

  // Submit compliant transfer
  app.post("/v1/transfers", async (request, reply) => {
    const body = submitTransferSchema.parse(request.body);
    const inst = request.institution!;

    const transfer = await transferService.submitTransfer(
      inst.id,
      body,
      inst.authorityPubkey
    );

    return reply.status(201).send({
      id: transfer.id,
      nonce: transfer.nonce,
      status: transfer.status,
      txSignature: transfer.txSignature,
      createdAt: transfer.createdAt,
    });
  });

  // Get transfer by nonce
  app.get<{ Params: { nonce: string } }>("/v1/transfers/:nonce", async (request, reply) => {
    const transfer = await transferService.getTransfer(request.params.nonce);
    if (!transfer) {
      return reply.status(404).send({ error: "Transfer not found" });
    }
    return transfer;
  });

  // List transfers
  app.get<{ Querystring: { limit?: string; offset?: string } }>(
    "/v1/transfers",
    async (request) => {
      const inst = request.institution!;
      const limit = Math.min(Math.max(parseInt(request.query.limit || "50", 10) || 50, 1), 200);
      const offset = Math.max(parseInt(request.query.offset || "0", 10) || 0, 0);
      return transferService.listTransfers(inst.id, limit, offset);
    }
  );
}
