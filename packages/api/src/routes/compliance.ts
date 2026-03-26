import { FastifyInstance } from "fastify";
import { randomBytes, createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { travelRuleData, transfers } from "../db/schema.js";
import { logAuditEvent } from "../services/audit.service.js";
import * as kycService from "../services/kyc.service.js";
import * as kytService from "../services/kyt.service.js";
import * as solanaService from "../services/solana.service.js";
import {
  kycVerifySchema,
  kytScoreSchema,
  travelRulePackageSchema,
  oracleAttestSchema,
  type TravelRulePackageInput,
  type OracleAttestInput,
} from "../schemas/compliance.schema.js";

// ─── Helpers ────────────────────────────────────────────────

function generateNonce(): string {
  return randomBytes(32).toString("hex");
}

function hashPayload(data: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

async function packageTravelRule(input: TravelRulePackageInput) {
  const nonce = generateNonce();

  const originatorData = {
    name: input.originator.name,
    wallet: input.originator.wallet,
    institution: input.originator.institution,
  };

  const beneficiaryData = {
    name: input.beneficiary.name,
    wallet: input.beneficiary.wallet,
    institution: input.beneficiary.institution,
  };

  const originatorHash = hashPayload(originatorData);
  const beneficiaryHash = hashPayload(beneficiaryData);
  const combinedHash = hashPayload({ originatorHash, beneficiaryHash, amount: input.amount });

  // Store in travel rule data table.
  // Use a placeholder institution ID for public endpoint — in production,
  // this would be resolved from the originator's institution.
  const [record] = await db
    .insert(travelRuleData)
    .values({
      nonce,
      originatorInstitutionId: "00000000-0000-0000-0000-000000000000", // placeholder for public API
      originatorName: input.originator.name,
      originatorAccount: input.originator.wallet,
      beneficiaryName: input.beneficiary.name,
      beneficiaryAccount: input.beneficiary.wallet,
      originatorDataHash: originatorHash,
      beneficiaryDataHash: beneficiaryHash,
      amount: BigInt(Math.round(input.amount * 1_000_000)), // Convert to USDC base units (6 decimals)
      tokenMint: input.currency === "USDC" ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" : input.currency,
      status: 0,
    })
    .returning();

  await logAuditEvent({
    institutionId: record.originatorInstitutionId,
    eventType: "travel_rule.created",
    entityType: "travel_rule",
    entityId: record.id,
    actor: "public-api",
    details: { nonce, amount: input.amount, currency: input.currency },
  });

  return {
    hash: combinedHash,
    transferNonce: nonce,
    originatorHash,
    beneficiaryHash,
    createdAt: record.createdAt.toISOString(),
  };
}

async function attestCompliance(input: OracleAttestInput) {
  const attestedAt = new Date();

  // First try looking up from transfers table (institutional /v1/ flow)
  const [transfer] = await db
    .select()
    .from(transfers)
    .where(eq(transfers.nonce, input.transferNonce));

  if (transfer) {
    if (transfer.status === 1) {
      return {
        txSignature: transfer.txSignature,
        status: "already_attested",
        attestedAt: transfer.confirmedAt?.toISOString() ?? attestedAt.toISOString(),
      };
    }

    const { txSignature } = await solanaService.submitAttestation(input.transferNonce, {
      transferNonce: input.transferNonce,
      status: "attested",
      senderWallet: transfer.senderWallet,
      receiverWallet: transfer.receiverWallet,
      amount: transfer.amount.toString(),
      timestamp: attestedAt.toISOString(),
    });

    await db
      .update(transfers)
      .set({ status: 1, txSignature, confirmedAt: attestedAt })
      .where(eq(transfers.nonce, input.transferNonce));

    await logAuditEvent({
      institutionId: transfer.institutionId,
      eventType: "transfer.completed",
      entityType: "transfer",
      entityId: transfer.id,
      actor: "oracle",
      details: { nonce: input.transferNonce, txSignature },
      txSignature,
    });

    return { txSignature, status: "attested", attestedAt: attestedAt.toISOString() };
  }

  // Fallback: look up from travelRuleData (public /api/ flow from frontend)
  const [travelRule] = await db
    .select()
    .from(travelRuleData)
    .where(eq(travelRuleData.nonce, input.transferNonce));

  if (!travelRule) {
    throw new Error(`Transfer not found for nonce: ${input.transferNonce}`);
  }

  if (travelRule.status === 2) {
    return {
      txSignature: travelRule.onchainPubkey ?? "",
      status: "already_attested",
      attestedAt: travelRule.updatedAt.toISOString(),
    };
  }

  const { txSignature } = await solanaService.submitAttestation(input.transferNonce, {
    transferNonce: input.transferNonce,
    status: "attested",
    senderWallet: travelRule.originatorAccount,
    receiverWallet: travelRule.beneficiaryAccount,
    amount: travelRule.amount.toString(),
    timestamp: attestedAt.toISOString(),
  });

  await db
    .update(travelRuleData)
    .set({ status: 2, onchainPubkey: txSignature, updatedAt: attestedAt })
    .where(eq(travelRuleData.nonce, input.transferNonce));

  await logAuditEvent({
    institutionId: travelRule.originatorInstitutionId,
    eventType: "travel_rule.approved",
    entityType: "travel_rule",
    entityId: travelRule.id,
    actor: "oracle",
    details: { nonce: input.transferNonce, txSignature },
    txSignature,
  });

  return { txSignature, status: "attested", attestedAt: attestedAt.toISOString() };
}

// ─── Route Registration ─────────────────────────────────────

export async function complianceRoutes(app: FastifyInstance) {
  // POST /api/kyc/verify — KYC verification (mock Sumsub)
  app.post("/api/kyc/verify", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    try {
      const body = kycVerifySchema.parse(request.body);
      const result = await kycService.verifyKyc(body);
      await logAuditEvent({
        institutionId: "00000000-0000-0000-0000-000000000000", // public API
        eventType: "kyc.verified",
        entityType: "entity",
        actor: "public-api",
        details: { walletAddress: body.walletAddress, verified: result.verified, kycLevel: result.kycLevel },
      });
      return reply.send(result);
    } catch (err) {
      if (err instanceof Error && err.name === "ZodError") {
        const issues = (err as any).issues?.map((i: any) => ({ path: i.path.join("."), message: i.message })) ?? [];
        return reply.status(400).send({ error: "Validation failed", details: issues });
      }
      request.log.error(err, "KYC verification failed");
      return reply.status(500).send({ error: "KYC verification failed" });
    }
  });

  // POST /api/kyt/score — KYT transaction risk scoring
  app.post("/api/kyt/score", async (request, reply) => {
    try {
      const body = kytScoreSchema.parse(request.body);
      const result = await kytService.scoreTransaction(body);
      await logAuditEvent({
        institutionId: "00000000-0000-0000-0000-000000000000",
        eventType: "kyt.scored",
        entityType: "transfer",
        actor: "public-api",
        details: { walletAddress: body.walletAddress, score: result.score, passed: result.passed },
      });
      // Flatten factors into string array for frontend consumption
      return reply.send({
        score: result.score,
        passed: result.passed,
        factors: [
          `Amount: ${result.factors.amountRisk.detail}`,
          `Wallet: ${result.factors.walletAge.detail}`,
          `Volume: ${result.factors.volumeRisk.detail}`,
          `Counterparty: ${result.factors.counterpartyRisk.detail}`,
        ],
      });
    } catch (err) {
      if (err instanceof Error && err.name === "ZodError") {
        const issues = (err as any).issues?.map((i: any) => ({ path: i.path.join("."), message: i.message })) ?? [];
        return reply.status(400).send({ error: "Validation failed", details: issues });
      }
      request.log.error(err, "KYT scoring failed");
      return reply.status(500).send({ error: "KYT scoring failed" });
    }
  });

  // POST /api/travel-rule/package — Package travel rule data (IVMS101)
  app.post("/api/travel-rule/package", async (request, reply) => {
    try {
      const body = travelRulePackageSchema.parse(request.body);
      const result = await packageTravelRule(body);
      return reply.send(result);
    } catch (err) {
      if (err instanceof Error && err.name === "ZodError") {
        const issues = (err as any).issues?.map((i: any) => ({ path: i.path.join("."), message: i.message })) ?? [];
        return reply.status(400).send({ error: "Validation failed", details: issues });
      }
      request.log.error(err, "Travel rule packaging failed");
      return reply.status(500).send({ error: "Travel rule packaging failed" });
    }
  });

  // POST /api/oracle/attest — Oracle compliance attestation (on-chain)
  app.post("/api/oracle/attest", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    try {
      const body = oracleAttestSchema.parse(request.body);
      const result = await attestCompliance(body);
      return reply.send(result);
    } catch (err) {
      if (err instanceof Error && err.message.includes("Transfer not found")) {
        return reply.status(404).send({ error: "Transfer not found for the provided nonce" });
      }
      if (err instanceof Error && err.name === "ZodError") {
        const issues = (err as any).issues?.map((i: any) => ({ path: i.path.join("."), message: i.message })) ?? [];
        return reply.status(400).send({ error: "Validation failed", details: issues });
      }
      request.log.error(err, "Oracle attestation failed");
      return reply.status(500).send({ error: "Oracle attestation failed" });
    }
  });
}
