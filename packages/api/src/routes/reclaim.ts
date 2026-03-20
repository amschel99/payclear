import { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import { ReclaimVerificationService, hashProofIdentifier } from "../services/reclaim/verification.service.js";
import * as proofStore from "../services/reclaim/proof-store.js";
import type { ReclaimProof } from "@payclear/sdk/src/utils/reclaim-types.js";

const verificationService = new ReclaimVerificationService();

export async function reclaimRoutes(app: FastifyInstance) {
  // All reclaim routes require institution auth
  app.addHook("onRequest", authMiddleware);

  // ─── POST /v1/proofs/request ──────────────────────────────
  // Create a proof request for a wallet
  app.post<{
    Body: {
      walletAddress: string;
      requiredKycLevel: number;
      acceptedProviders: string[];
    };
  }>("/v1/proofs/request", async (request, reply) => {
    const { walletAddress, requiredKycLevel, acceptedProviders } =
      request.body as {
        walletAddress: string;
        requiredKycLevel: number;
        acceptedProviders: string[];
      };

    if (!walletAddress || typeof walletAddress !== "string") {
      return reply.status(400).send({ error: "walletAddress is required" });
    }

    if (
      requiredKycLevel === undefined ||
      requiredKycLevel < 0 ||
      requiredKycLevel > 3
    ) {
      return reply
        .status(400)
        .send({ error: "requiredKycLevel must be 0-3" });
    }

    if (
      !acceptedProviders ||
      !Array.isArray(acceptedProviders) ||
      acceptedProviders.length === 0
    ) {
      return reply
        .status(400)
        .send({ error: "acceptedProviders must be a non-empty array" });
    }

    const proofRequest = verificationService.createProofRequest(
      walletAddress,
      requiredKycLevel,
      acceptedProviders
    );

    return reply.status(201).send(proofRequest);
  });

  // ─── POST /v1/proofs/verify ───────────────────────────────
  // Submit and verify a Reclaim proof
  app.post<{
    Body: {
      proof: ReclaimProof;
      institutionId: string;
    };
  }>("/v1/proofs/verify", async (request, reply) => {
    const { proof, institutionId } = request.body as {
      proof: ReclaimProof;
      institutionId: string;
    };
    const inst = request.institution!;

    if (!proof || !proof.identifier) {
      return reply.status(400).send({ error: "A valid proof is required" });
    }

    // Check for duplicate proof
    const existing = await proofStore.getProofByIdentifier(proof.identifier);
    if (existing) {
      return reply.status(409).send({
        error: "This proof has already been recorded",
        proofIdentifier: proof.identifier,
      });
    }

    // Verify the proof off-chain
    const result = await verificationService.verifyProof(proof);

    if (!result.valid) {
      return reply.status(422).send({
        verified: false,
        error: result.error,
      });
    }

    // Compute proof identifier hash for on-chain storage
    const proofIdHash = hashProofIdentifier(proof.identifier);

    // Determine the primary attestor from witnesses
    const attestorId =
      proof.witnesses.length > 0 ? proof.witnesses[0].id : "unknown";

    // Compute expiry
    const verifiedAt = new Date(result.kycClaim!.verifiedAt);
    const expiresAt = new Date(
      verifiedAt.getTime() + 24 * 60 * 60 * 1000 // 24h default
    );

    // Store proof in DB
    const storedProof = await proofStore.storeProof(
      {
        institutionId: inst.id,
        walletAddress: result.kycClaim!.walletAddress,
        proofIdentifier: proof.identifier,
        provider: result.kycClaim!.kycProvider,
        kycLevel: result.kycLevel,
        reclaimProofData: proof as unknown as Record<string, unknown>,
        attestorId,
        verifiedAt,
        expiresAt,
      },
      inst.authorityPubkey
    );

    return reply.status(200).send({
      verified: true,
      kycLevel: result.kycLevel,
      proofRecord: {
        id: storedProof.id,
        proofIdentifier: proof.identifier,
        proofIdentifierHash: proofIdHash.toString("hex"),
        provider: result.kycClaim!.kycProvider,
        walletAddress: result.kycClaim!.walletAddress,
        verifiedAt: verifiedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        status: "verified",
      },
    });
  });

  // ─── GET /v1/proofs/:identifier ───────────────────────────
  // Get proof details by identifier
  app.get<{ Params: { identifier: string } }>(
    "/v1/proofs/:identifier",
    async (request, reply) => {
      const proof = await proofStore.getProofByIdentifier(
        request.params.identifier
      );

      if (!proof) {
        return reply.status(404).send({ error: "Proof not found" });
      }

      return {
        id: proof.id,
        proofIdentifier: proof.proofIdentifier,
        provider: proof.provider,
        kycLevel: proof.kycLevel,
        walletAddress: proof.walletAddress,
        status: proof.status,
        verifiedAt: proof.verifiedAt,
        expiresAt: proof.expiresAt,
        onchainAddress: proof.onchainAddress,
        createdAt: proof.createdAt,
      };
    }
  );

  // ─── GET /v1/entities/:wallet/proofs ──────────────────────
  // List all ZK proofs for a wallet
  app.get<{ Params: { wallet: string } }>(
    "/v1/entities/:wallet/proofs",
    async (request, reply) => {
      const proofs = await proofStore.getProofsByWallet(
        request.params.wallet
      );

      return proofs.map((p) => ({
        id: p.id,
        proofIdentifier: p.proofIdentifier,
        provider: p.provider,
        kycLevel: p.kycLevel,
        status: p.status,
        verifiedAt: p.verifiedAt,
        expiresAt: p.expiresAt,
        onchainAddress: p.onchainAddress,
        createdAt: p.createdAt,
      }));
    }
  );
}
