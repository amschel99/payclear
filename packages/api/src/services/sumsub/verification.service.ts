import { readFileSync } from "fs";
import { eq, and } from "drizzle-orm";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { db } from "../../db/client.js";
import { entities } from "../../db/schema.js";
import { config } from "../../config.js";
import { logAuditEvent } from "../audit.service.js";
import { SumsubClient, type SumsubReviewResult } from "./client.js";
import { SasClient, type KycAttestationData } from "../sas/client.js";

// ─── Level Mapping ──────────────────────────────────────────

/**
 * Maps Sumsub verification level names to PayClear's 0-3 KYC scale.
 *
 * 0 = unverified
 * 1 = basic (name + document)
 * 2 = enhanced (basic + proof of address + liveness)
 * 3 = full (enhanced + source of funds)
 */
export function mapSumsubLevelToKycLevel(sumsubLevel: string): number {
  const normalized = sumsubLevel.toLowerCase();

  if (normalized.includes("full") || normalized.includes("source-of-funds") || normalized.includes("sof")) {
    return 3;
  }
  if (normalized.includes("enhanced") || normalized.includes("advanced")) {
    return 2;
  }
  if (normalized.includes("basic") || normalized.includes("id-and-selfie") || normalized.includes("simple")) {
    return 1;
  }

  // Default: treat any recognized level as at least basic
  return 1;
}

// ─── Lazy Singleton Clients ─────────────────────────────────

let _sumsubClient: SumsubClient | null = null;
function getSumsubClient(): SumsubClient {
  if (!_sumsubClient) {
    _sumsubClient = new SumsubClient();
  }
  return _sumsubClient;
}

let _sasClient: SasClient | null = null;
function getSasClient(): SasClient {
  if (!config.sas.programId) {
    throw new Error("SAS_PROGRAM_ID not configured");
  }

  if (!_sasClient) {
    const connection = new Connection(config.solana.rpcUrl, "confirmed");

    // Load institution authority keypair
    // In production this would come from a secure key management service
    let authorityKeypair: Keypair;
    try {
      const walletPath = config.solana.walletPath.replace("~", process.env.HOME ?? "");
      const secretKey = JSON.parse(readFileSync(walletPath, "utf-8"));
      authorityKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    } catch {
      // Fallback for environments without a wallet file (dev/test)
      authorityKeypair = Keypair.generate();
    }

    _sasClient = new SasClient(connection, authorityKeypair, config.sas.programId);
  }

  return _sasClient;
}

// ─── Verification Flow ──────────────────────────────────────

/**
 * Initiate a Sumsub verification for a wallet address.
 * Creates the Sumsub applicant if one doesn't exist, then returns
 * an access token the frontend can use to render the WebSDK.
 */
export async function initiateVerification(
  institutionId: string,
  walletAddress: string,
  kycLevel?: number,
): Promise<{ accessToken: string; applicantId: string }> {
  const sumsub = getSumsubClient();

  // Determine which Sumsub level to use based on requested KYC level
  let levelName = config.sumsub.defaultLevel;
  if (kycLevel !== undefined) {
    switch (kycLevel) {
      case 1:
        levelName = "basic-kyc-level";
        break;
      case 2:
        levelName = "enhanced-kyc-level";
        break;
      case 3:
        levelName = "full-kyc-level";
        break;
    }
  }

  // Check if entity already exists and has an applicant
  const [existingEntity] = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.institutionId, institutionId),
        eq(entities.walletAddress, walletAddress),
      ),
    );

  let applicantId: string;

  if (existingEntity?.sumsubApplicantId) {
    // Re-use existing applicant
    applicantId = existingEntity.sumsubApplicantId;
  } else {
    // Create new Sumsub applicant using wallet address as external ID
    const applicant = await sumsub.createApplicant(walletAddress, levelName);
    applicantId = applicant.id;

    if (existingEntity) {
      // Update existing entity with Sumsub applicant ID
      await db
        .update(entities)
        .set({
          sumsubApplicantId: applicantId,
          sumsubVerificationLevel: levelName,
          kycProvider: "sumsub",
          updatedAt: new Date(),
        })
        .where(eq(entities.id, existingEntity.id));
    } else {
      // Create a new entity in pending state
      await db.insert(entities).values({
        institutionId,
        walletAddress,
        kycLevel: 0,
        riskScore: 0,
        status: 0, // pending
        sumsubApplicantId: applicantId,
        sumsubVerificationLevel: levelName,
        kycProvider: "sumsub",
      });
    }
  }

  // Generate a WebSDK access token
  const tokenResponse = await sumsub.generateAccessToken(walletAddress, levelName);

  await logAuditEvent({
    institutionId,
    eventType: "entity.created",
    entityType: "entity",
    actor: "sumsub-verification",
    details: {
      walletAddress,
      applicantId,
      levelName,
      action: "verification_initiated",
    },
  });

  return {
    accessToken: tokenResponse.token,
    applicantId,
  };
}

/**
 * Process a completed verification result from Sumsub webhook.
 * Updates entity status and triggers on-chain attestation if approved.
 */
export async function processVerificationResult(
  applicantId: string,
  externalUserId: string,
  reviewResult: SumsubReviewResult,
  levelName?: string,
): Promise<void> {
  // Find the entity by wallet address (externalUserId = walletAddress)
  const [entity] = await db
    .select()
    .from(entities)
    .where(eq(entities.walletAddress, externalUserId));

  if (!entity) {
    throw new Error(`No entity found for wallet address: ${externalUserId}`);
  }

  const isApproved = reviewResult.reviewAnswer === "GREEN";

  if (isApproved) {
    // Map Sumsub level to PayClear KYC level
    const kycLevel = mapSumsubLevelToKycLevel(levelName ?? entity.sumsubVerificationLevel ?? "basic-kyc-level");

    // Update entity to active
    await db
      .update(entities)
      .set({
        status: 1, // active
        kycLevel,
        riskScore: 10, // Low risk for verified users; can be refined with Sumsub risk signals
        sumsubReviewStatus: "completed",
        kycProvider: "sumsub",
        updatedAt: new Date(),
      })
      .where(eq(entities.id, entity.id));

    // Write SAS attestation on-chain
    try {
      await syncAttestationOnChain(entity.id);
    } catch (err) {
      // Log but don't fail — the entity is still updated
      console.error(`Failed to write SAS attestation for entity ${entity.id}:`, err);
    }

    await logAuditEvent({
      institutionId: entity.institutionId,
      eventType: "entity.updated",
      entityType: "entity",
      entityId: entity.id,
      actor: "sumsub-webhook",
      details: {
        walletAddress: externalUserId,
        applicantId,
        reviewAnswer: "GREEN",
        kycLevel,
        action: "verification_approved",
      },
    });
  } else {
    // Rejected or error
    await db
      .update(entities)
      .set({
        status: 3, // revoked
        sumsubReviewStatus: reviewResult.reviewRejectType === "RETRY" ? "retry" : "rejected",
        kycProvider: "sumsub",
        updatedAt: new Date(),
      })
      .where(eq(entities.id, entity.id));

    await logAuditEvent({
      institutionId: entity.institutionId,
      eventType: "entity.revoked",
      entityType: "entity",
      entityId: entity.id,
      actor: "sumsub-webhook",
      details: {
        walletAddress: externalUserId,
        applicantId,
        reviewAnswer: reviewResult.reviewAnswer,
        rejectLabels: reviewResult.rejectLabels,
        reviewRejectType: reviewResult.reviewRejectType,
        moderationComment: reviewResult.moderationComment,
        action: "verification_rejected",
      },
    });
  }
}

/**
 * Write or update the SAS attestation on-chain based on current entity state.
 */
export async function syncAttestationOnChain(entityId: string): Promise<void> {
  const [entity] = await db
    .select()
    .from(entities)
    .where(eq(entities.id, entityId));

  if (!entity) {
    throw new Error(`Entity not found: ${entityId}`);
  }

  if (entity.status !== 1) {
    // Only write attestations for active entities
    return;
  }

  const sas = getSasClient();
  const wallet = new PublicKey(entity.walletAddress);

  const attestationData: KycAttestationData = {
    kycLevel: entity.kycLevel,
    riskScore: entity.riskScore,
    kycProvider: (entity.kycProvider as "sumsub" | "self") ?? "self",
    verificationId: entity.sumsubApplicantId ?? entity.id,
    jurisdiction: entity.nationality ?? "XX",
    expiresAt: entity.expiresAt
      ? Math.floor(entity.expiresAt.getTime() / 1000)
      : Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 year default
  };

  const attestationAddress = await sas.createAttestation(wallet, attestationData);

  // Store the attestation address on the entity
  await db
    .update(entities)
    .set({
      sasAttestationAddress: attestationAddress,
      onchainPubkey: attestationAddress,
      updatedAt: new Date(),
    })
    .where(eq(entities.id, entityId));
}
