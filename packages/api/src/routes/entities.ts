import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { createEntitySchema, updateEntitySchema } from "../schemas/entity.schema.js";
import * as entityService from "../services/entity.service.js";
import { initiateVerification } from "../services/sumsub/verification.service.js";

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

  // Initiate Sumsub verification for a wallet
  const verifyBodySchema = z.object({
    kycLevel: z.number().int().min(1).max(3).optional(),
  });

  app.post<{ Params: { wallet: string } }>("/v1/entities/:wallet/verify", async (request, reply) => {
    const inst = request.institution!;
    const body = verifyBodySchema.parse(request.body ?? {});

    try {
      const result = await initiateVerification(
        inst.id,
        request.params.wallet,
        body.kycLevel,
      );

      return reply.status(200).send({
        accessToken: result.accessToken,
        applicantId: result.applicantId,
      });
    } catch (err) {
      request.log.error({ err }, "Failed to initiate Sumsub verification");
      return reply.status(500).send({ error: "Failed to initiate verification" });
    }
  });

  // Check current verification status for a wallet
  app.get<{ Params: { wallet: string } }>("/v1/entities/:wallet/verification-status", async (request, reply) => {
    const inst = request.institution!;
    const entity = await entityService.getEntity(inst.id, request.params.wallet);

    if (!entity) {
      return reply.status(404).send({ error: "Entity not found" });
    }

    return {
      walletAddress: entity.walletAddress,
      status: entity.status,
      kycLevel: entity.kycLevel,
      kycProvider: entity.kycProvider ?? "self",
      sumsubApplicantId: entity.sumsubApplicantId,
      sumsubReviewStatus: entity.sumsubReviewStatus,
      sumsubVerificationLevel: entity.sumsubVerificationLevel,
      sasAttestationAddress: entity.sasAttestationAddress,
    };
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
