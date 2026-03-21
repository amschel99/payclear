import { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import {
  addTrustedInstitutionSchema,
  acceptExternalAttestationSchema,
} from "../schemas/trust.schema.js";
import * as trustService from "../services/trust.service.js";

export async function trustRoutes(app: FastifyInstance) {
  // All trust network routes require institution authentication
  app.addHook("onRequest", authMiddleware);

  // ─── Trust Network Management ──────────────────────────────

  /**
   * Add an institution to the caller's trust network.
   * Once trusted, the caller can accept KYC attestations from that institution
   * without requiring the wallet to re-submit PII.
   */
  app.post("/v1/trust-network", async (request, reply) => {
    const body = addTrustedInstitutionSchema.parse(request.body);
    const inst = request.institution!;

    try {
      const record = await trustService.addTrustedInstitution(
        inst.id,
        body.trustedInstitutionId,
        body.minKycLevel,
        body.requireSameJurisdiction,
        inst.authorityPubkey
      );

      return reply.status(201).send({
        id: record.id,
        institutionId: record.institutionId,
        trustedInstitutionId: record.trustedInstitutionId,
        minKycLevel: record.minKycLevel,
        requireSameJurisdiction: record.requireSameJurisdiction,
        createdAt: record.createdAt,
      });
    } catch (error: any) {
      // Handle unique constraint violation (already trusted)
      if (error.code === "23505") {
        return reply.status(409).send({
          error: "Institution is already in your trust network",
        });
      }
      return reply.status(400).send({ error: error.message });
    }
  });

  /**
   * Remove an institution from the caller's trust network.
   *
   * Note: This does NOT revoke any entities that were previously accepted
   * based on trust in the removed institution. Those entities are first-class
   * records owned by the calling institution and must be revoked explicitly
   * via DELETE /v1/entities/:wallet if desired.
   */
  app.delete<{ Params: { institutionId: string } }>(
    "/v1/trust-network/:institutionId",
    async (request, reply) => {
      const inst = request.institution!;

      const deleted = await trustService.removeTrustedInstitution(
        inst.id,
        request.params.institutionId,
        inst.authorityPubkey
      );

      if (!deleted) {
        return reply.status(404).send({
          error: "Institution not found in your trust network",
        });
      }

      return { message: "Institution removed from trust network" };
    }
  );

  /**
   * List all institutions in the caller's trust network, including their
   * names and jurisdictions for display purposes.
   */
  app.get("/v1/trust-network", async (request) => {
    const inst = request.institution!;
    const records = await trustService.listTrustedInstitutions(inst.id);
    return { trustNetwork: records };
  });

  // ─── Accept External Attestation ──────────────────────────

  /**
   * Accept an external KYC attestation for a wallet.
   *
   * This creates a local entity record under the calling institution,
   * referencing the original institution's attestation for provenance.
   * No PII is copied — only the KYC level, risk score, and hash.
   *
   * Prerequisites:
   * 1. The external institution must be in the caller's trust network
   * 2. The external entity must be active (status = 1)
   * 3. The external entity's KYC level must meet the trust network's minimum
   * 4. If requireSameJurisdiction is set, both institutions must share the
   *    same jurisdiction
   * 5. No entity must already exist for this wallet under the calling institution
   */
  app.post<{ Params: { wallet: string } }>(
    "/v1/entities/:wallet/accept",
    async (request, reply) => {
      const body = acceptExternalAttestationSchema.parse(request.body);
      const inst = request.institution!;

      try {
        const result = await trustService.acceptExternalAttestation(
          inst.id,
          {
            walletAddress: request.params.wallet,
            externalInstitutionId: body.externalInstitutionId,
          },
          inst.authorityPubkey
        );

        return reply.status(201).send({
          id: result.entity.id,
          walletAddress: result.entity.walletAddress,
          kycLevel: result.entity.kycLevel,
          riskScore: result.entity.riskScore,
          status: result.entity.status,
          kycHash: result.entity.kycHash,
          originalInstitutionId: result.originalInstitutionId,
          originalEntityId: result.originalEntityId,
          createdAt: result.entity.createdAt,
        });
      } catch (error: any) {
        // Handle unique constraint (entity already exists for this wallet)
        if (error.code === "23505") {
          return reply.status(409).send({
            error:
              "An entity already exists for this wallet under your institution",
          });
        }
        return reply.status(400).send({ error: error.message });
      }
    }
  );
}
