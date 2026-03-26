import { randomBytes } from "crypto";
import { config } from "../config.js";
import { SumsubClient } from "./sumsub/client.js";
import type { KycVerifyInput } from "../schemas/compliance.schema.js";

// ─── Types ──────────────────────────────────────────────────

export interface KycVerifyResult {
  verified: boolean;
  status: "verified" | "pending" | "rejected";
  kycLevel: number;
  expiresAt: string;
  applicantId: string;
}

// ─── Sumsub Integration ─────────────────────────────────────

/**
 * Mock Sumsub verification for dev environments where no API credentials
 * are configured. Returns a hardcoded GREEN result.
 */
async function verifySumsubMock(_externalUserId: string) {
  console.log(
    "[KYC] Sumsub mock mode — SUMSUB_APP_TOKEN not configured. Returning GREEN."
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
  return {
    applicantId: `mock_${randomBytes(12).toString("hex")}`,
    reviewAnswer: "GREEN" as const,
    riskLabels: [] as string[],
  };
}

/**
 * Verify an applicant via the real Sumsub API using the shared SumsubClient:
 * 1. Create an applicant with identity info
 * 2. Fetch the applicant's review status
 */
async function verifySumsubReal(input: KycVerifyInput) {
  const client = new SumsubClient();

  // Parse fullName into first/last (best-effort split)
  const nameParts = input.fullName.trim().split(/\s+/);
  const firstName = nameParts[0] || input.fullName;
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined;

  const levelName = config.sumsub.defaultLevel;

  // Step 1: Create applicant
  const applicant = await client.createApplicant(
    input.wallet,
    levelName,
    {
      firstName,
      lastName,
      dob: input.dateOfBirth,
      country: input.nationality,
    }
  );

  // Step 2: Get the applicant review status
  const status = await client.getApplicant(applicant.id);

  // If no review exists yet, Sumsub hasn't finished — treat as pending
  const reviewAnswer = status.review?.reviewAnswer ?? null;
  const riskLabels = status.review?.rejectLabels ?? [];

  return {
    applicantId: applicant.id,
    reviewAnswer,
    riskLabels,
  };
}

// ─── KYC Level Determination ────────────────────────────────

function determineKycLevel(input: KycVerifyInput): number {
  const hasFullName = !!input.fullName;
  const hasDob = !!input.dateOfBirth;
  const hasNationality = !!input.nationality;

  if (hasFullName && hasDob && hasNationality) {
    return 3; // Full KYC — all identity fields provided
  }
  if (hasFullName && (hasDob || hasNationality)) {
    return 2; // Partial KYC — name plus one additional field
  }
  return 1; // Minimal KYC — basic wallet association only
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Orchestrates the full KYC verification flow:
 * 1. Call Sumsub (real API via SumsubClient, or mock depending on config)
 * 2. Determine KYC level based on data completeness
 * 3. Return verification result
 *
 * Entity persistence is handled by the route layer so the caller
 * can control the institution context and audit logging.
 */
export async function verifyKyc(input: KycVerifyInput): Promise<KycVerifyResult> {
  const result = config.sumsub.appToken
    ? await verifySumsubReal(input)
    : await verifySumsubMock(input.wallet);

  const verified = result.reviewAnswer === "GREEN";
  const rejected = result.reviewAnswer === "RED";
  const status = verified ? "verified" as const : rejected ? "rejected" as const : "pending" as const;
  const kycLevel = verified ? determineKycLevel(input) : 0;

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  return {
    verified,
    status,
    kycLevel,
    expiresAt: expiresAt.toISOString(),
    applicantId: result.applicantId,
  };
}
