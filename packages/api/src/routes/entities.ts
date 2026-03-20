import { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import { createEntitySchema, updateEntitySchema } from "../schemas/entity.schema.js";
import * as entityService from "../services/entity.service.js";

export async function entityRoutes(app: FastifyInstance) {
  // All entity routes require institution auth
  app.addHook("onRequest", authMiddleware);

  // Create entity (KYC-verified wallet)
  app.post("/v1/entities", async (request, reply) => {
    const body = createEntitySchema.parse(request.body);
    const inst = request.institution!;

    const { entity, kycHash } = await entityService.createEntity(
      inst.id,
      body,
      inst.authorityPubkey
    );

    return reply.status(201).send({
      id: entity.id,
      walletAddress: entity.walletAddress,
      kycLevel: entity.kycLevel,
      riskScore: entity.riskScore,
      status: entity.status,
      kycHash,
      createdAt: entity.createdAt,
    });
  });

  // Get entity by wallet
  app.get<{ Params: { wallet: string } }>("/v1/entities/:wallet", async (request, reply) => {
    const inst = request.institution!;
    const entity = await entityService.getEntity(inst.id, request.params.wallet);
    if (!entity) {
      return reply.status(404).send({ error: "Entity not found" });
    }
    return {
      id: entity.id,
      walletAddress: entity.walletAddress,
      kycLevel: entity.kycLevel,
      riskScore: entity.riskScore,
      status: entity.status,
      kycHash: entity.kycHash,
      expiresAt: entity.expiresAt,
      createdAt: entity.createdAt,
    };
  });

  // Update entity (KYC level, risk score, status)
  app.patch<{ Params: { wallet: string } }>("/v1/entities/:wallet", async (request, reply) => {
    const body = updateEntitySchema.parse(request.body);
    const inst = request.institution!;

    const updated = await entityService.updateEntity(
      inst.id,
      request.params.wallet,
      body,
      inst.authorityPubkey
    );

    if (!updated) {
      return reply.status(404).send({ error: "Entity not found" });
    }
    return updated;
  });

  // Revoke entity attestation
  app.delete<{ Params: { wallet: string } }>("/v1/entities/:wallet", async (request, reply) => {
    const inst = request.institution!;

    const updated = await entityService.updateEntity(
      inst.id,
      request.params.wallet,
      { status: 3 }, // revoked
      inst.authorityPubkey
    );

    if (!updated) {
      return reply.status(404).send({ error: "Entity not found" });
    }
    return { message: "Attestation revoked" };
  });
}
