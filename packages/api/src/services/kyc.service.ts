import { createHmac, randomBytes } from "crypto";
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

// ─── Sumsub Auth Helpers ────────────────────────────────────

/**
 * Compute HMAC-SHA256 signature for Sumsub API authentication.
 *
 * Signature = HMAC-SHA256(secretKey, timestamp + method + path + body)
 */
function generateSumsubSignature(
  method: string,
  path: string,
  body: string,
  ts: number
): string {
  const data = ts.toString() + method.toUpperCase() + path + body;
  return createHmac("sha256", config.sumsub.secretKey)
    .update(data)
    .digest("hex");
}

/**
 * Make an authenticated HTTP request to the Sumsub API.
 * Handles HMAC signature generation and required auth headers.
 */
async function sumsubRequest<T = unknown>(
  method: string,
  path: string,
  body?: object
): Promise<T> {
  const ts = Math.floor(Date.now() / 1000);
  const bodyStr = body ? JSON.stringify(body) : "";
  const signature = generateSumsubSignature(method, path, bodyStr, ts);

  const url = `${config.sumsub.baseUrl}${path}`;

  const headers: Record<string, string> = {
    "X-App-Token": config.sumsub.appToken,
    "X-App-Access-Sig": signature,
    "X-App-Access-Ts": ts.toString(),
    Accept: "application/json",
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method: method.toUpperCase(),
    headers,
    body: body ? bodyStr : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Sumsub API error: ${response.status} ${response.statusText} — ${errorBody}`
    );
  }

  return (await response.json()) as T;
}

// ─── Sumsub Integration ─────────────────────────────────────

/**
 * Mock Sumsub verification for dev environments where no API credentials
 * are configured. Returns a hardcoded GREEN result.
 */
async function verifySumsubMock(
  externalUserId: string
): Promise<SumsubResult> {
  console.log(
    "[KYC] Sumsub mock mode — SUMSUB_APP_TOKEN not configured. Returning GREEN."
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
  return {
    applicantId: `mock_${randomBytes(12).toString("hex")}`,
    reviewStatus: "completed",
    reviewResult: { reviewAnswer: "GREEN" },
    riskLabels: [],
  };
}

interface SumsubApplicantResponse {
  id: string;
  inspectionId?: string;
  review?: {
    reviewStatus: string;
    reviewResult?: {
      reviewAnswer: string;
      rejectLabels?: string[];
    };
  };
}

/**
 * Verify an applicant via the real Sumsub API:
 * 1. Create an applicant with identity info
 * 2. Trigger an ID document check
 * 3. Fetch the applicant's review status
 */
async function verifySumsubReal(
  input: KycVerifyInput
): Promise<SumsubResult> {
  // Parse fullName into first/last (best-effort split)
  const nameParts = input.fullName.trim().split(/\s+/);
  const firstName = nameParts[0] || input.fullName;
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

  // Step 1: Create applicant
  const levelName = config.sumsub.defaultLevel;
  const createPath = `/resources/applicants?levelName=${encodeURIComponent(levelName)}`;

  const applicant = await sumsubRequest<SumsubApplicantResponse>(
    "POST",
    createPath,
    {
      externalUserId: input.wallet,
      info: {
        firstName,
        lastName: lastName || undefined,
        dob: input.dateOfBirth,
        country: input.nationality,
      },
    }
  );

  const applicantId = applicant.id;

  // Step 2: Add an ID document check (triggers the verification flow)
  try {
    await sumsubRequest("POST", `/resources/applicants/${applicantId}/info/idDoc`, {
      country: input.nationality,
      idDocType: "IDENTITY",
    });
  } catch (err) {
    // Non-fatal — the applicant is still created; document check can proceed
    // via SDK or webhook. Log and continue.
    console.warn(
      `[KYC] Failed to add idDoc for applicant ${applicantId}:`,
      err instanceof Error ? err.message : err
    );
  }

  // Step 3: Get the applicant review status
  const status = await sumsubRequest<SumsubApplicantResponse>(
    "GET",
    `/resources/applicants/${applicantId}/one`
  );

  const reviewStatus = status.review?.reviewStatus ?? "pending";
  const reviewAnswer = status.review?.reviewResult?.reviewAnswer ?? "RED";
  const riskLabels = status.review?.reviewResult?.rejectLabels ?? [];

  return {
    applicantId,
    reviewStatus: reviewStatus as SumsubResult["reviewStatus"],
    reviewResult: {
      reviewAnswer: reviewAnswer as SumsubResult["reviewResult"]["reviewAnswer"],
    },
    riskLabels,
  };
}

/**
 * Verify applicant via Sumsub API.
 * Falls back to mock when SUMSUB_APP_TOKEN is not configured (dev environments).
 */
async function verifySumsub(input: KycVerifyInput): Promise<SumsubResult> {
  if (!config.sumsub.appToken) {
    return verifySumsubMock(input.wallet);
  }
  return verifySumsubReal(input);
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
 * 1. Call Sumsub (real API or mock depending on config)
 * 2. Determine KYC level based on data completeness
 * 3. Return verification result
 *
 * Entity persistence is handled by the route layer so the caller
 * can control the institution context and audit logging.
 */
export async function verifyKyc(input: KycVerifyInput): Promise<KycVerifyResult> {
  const sumsubResult = await verifySumsub(input);

  const verified = sumsubResult.reviewResult.reviewAnswer === "GREEN";
  const kycLevel = verified ? determineKycLevel(input) : 0;

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  return {
    verified,
    kycLevel,
    expiresAt: expiresAt.toISOString(),
    applicantId: sumsubResult.applicantId,
  };
}
