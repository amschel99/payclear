import { randomBytes } from "crypto";
import { config } from "../config.js";
import type { KycVerifyInput } from "../schemas/compliance.schema.js";

// ─── Types ──────────────────────────────────────────────────

interface SumsubResult {
  applicantId: string;
  reviewStatus: "completed" | "pending" | "rejected";
  reviewResult: {
    reviewAnswer: "GREEN" | "YELLOW" | "RED";
  };
  riskLabels: string[];
}

export interface KycVerifyResult {
  verified: boolean;
  kycLevel: number;
  expiresAt: string;
  applicantId: string;
}

// ─── Sumsub Integration (mocked for hackathon) ─────────────

/**
 * Verify applicant via Sumsub API.
 * Currently mocked for the hackathon demo — replace this function body
 * with real Sumsub HTTP calls when integrating.
 */
async function verifySumsub(applicantId: string): Promise<SumsubResult> {
  // Simulate Sumsub API latency
  await new Promise((resolve) => setTimeout(resolve, 500));

  // In production, this would call:
  // POST https://api.sumsub.com/resources/applicants
  // GET  https://api.sumsub.com/resources/applicants/{applicantId}/requiredIdDocsStatus
  // using config.sumsub.appToken / config.sumsub.appSecret

  return {
    applicantId,
    reviewStatus: "completed",
    reviewResult: {
      reviewAnswer: "GREEN",
    },
    riskLabels: [],
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
 * 1. Generate applicant ID
 * 2. Call Sumsub (mocked)
 * 3. Determine KYC level based on data completeness
 * 4. Return verification result
 *
 * Entity persistence is handled by the route layer so the caller
 * can control the institution context and audit logging.
 */
export async function verifyKyc(input: KycVerifyInput): Promise<KycVerifyResult> {
  const applicantId = `sumsub_${randomBytes(12).toString("hex")}`;

  const sumsubResult = await verifySumsub(applicantId);

  const verified = sumsubResult.reviewResult.reviewAnswer === "GREEN";
  const kycLevel = verified ? determineKycLevel(input) : 0;

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  return {
    verified,
    kycLevel,
    expiresAt: expiresAt.toISOString(),
    applicantId,
  };
}
