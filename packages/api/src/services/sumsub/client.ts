import { createHmac } from "crypto";
import { config } from "../../config.js";

// ─── Types ──────────────────────────────────────────────────

export interface SumsubFixedInfo {
  firstName?: string;
  lastName?: string;
  middleName?: string;
  dob?: string; // YYYY-MM-DD
  country?: string; // ISO 3166-1 alpha-3
  nationality?: string;
  phone?: string;
  email?: string;
}

export interface SumsubApplicant {
  id: string;
  createdAt: string;
  externalUserId: string;
  inspectionId: string;
  fixedInfo?: SumsubFixedInfo;
  review?: SumsubReviewResult;
  type: string;
}

export interface SumsubReviewResult {
  reviewAnswer: "GREEN" | "RED" | "ERROR";
  moderationComment?: string;
  clientComment?: string;
  rejectLabels?: string[];
  reviewRejectType?: "RETRY" | "FINAL" | "EXTERNAL";
  reviewStatus?: string;
}

export interface SumsubApplicantStatus {
  id: string;
  inspectionId: string;
  applicantId: string;
  createDate: string;
  reviewDate?: string;
  reviewResult?: SumsubReviewResult;
  reviewStatus: "init" | "pending" | "prechecked" | "queued" | "completed" | "onHold";
  priority?: number;
}

export interface SumsubAccessToken {
  token: string;
  userId: string;
}

export interface SumsubVerificationResult {
  id: string;
  applicantId: string;
  reviewResult: SumsubReviewResult;
  reviewStatus: string;
  createdAt: string;
  checks: SumsubCheck[];
}

export interface SumsubCheck {
  checkType: string;
  answer: "GREEN" | "RED" | "ERROR";
  createdAt: string;
  id: string;
}

// ─── Client ─────────────────────────────────────────────────

export class SumsubClient {
  private readonly appToken: string;
  private readonly secretKey: string;
  private readonly baseUrl: string;

  constructor(
    appToken?: string,
    secretKey?: string,
    baseUrl?: string,
  ) {
    this.appToken = appToken ?? config.sumsub.appToken;
    this.secretKey = secretKey ?? config.sumsub.secretKey;
    this.baseUrl = baseUrl ?? config.sumsub.baseUrl;
  }

  /**
   * Generate HMAC-SHA256 request signature per Sumsub's auth spec.
   * Signature = HMAC_SHA256(secretKey, ts + method + path + body)
   */
  generateSignature(
    ts: number,
    method: string,
    path: string,
    body?: string,
  ): string {
    const data = ts + method.toUpperCase() + path + (body ?? "");
    return createHmac("sha256", this.secretKey).update(data).digest("hex");
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const ts = Math.floor(Date.now() / 1000);
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const signature = this.generateSignature(ts, method, path, bodyStr);

    const headers: Record<string, string> = {
      "Accept": "application/json",
      "X-App-Token": this.appToken,
      "X-App-Access-Sig": signature,
      "X-App-Access-Ts": String(ts),
    };

    if (bodyStr) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: bodyStr,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Sumsub API error: ${response.status} ${response.statusText} — ${errorBody}`,
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Create a new applicant in Sumsub for KYC verification.
   */
  async createApplicant(
    externalUserId: string,
    levelName: string,
    fixedInfo?: SumsubFixedInfo,
  ): Promise<SumsubApplicant> {
    const body: Record<string, unknown> = {
      externalUserId,
      levelName,
    };

    if (fixedInfo) {
      body.fixedInfo = fixedInfo;
    }

    return this.request<SumsubApplicant>(
      "POST",
      "/resources/applicants?levelName=" + encodeURIComponent(levelName),
      body,
    );
  }

  /**
   * Fetch an applicant by ID.
   */
  async getApplicant(applicantId: string): Promise<SumsubApplicant> {
    return this.request<SumsubApplicant>(
      "GET",
      `/resources/applicants/${applicantId}`,
    );
  }

  /**
   * Get the review status for an applicant.
   */
  async getApplicantStatus(applicantId: string): Promise<SumsubApplicantStatus> {
    return this.request<SumsubApplicantStatus>(
      "GET",
      `/resources/applicants/${applicantId}/requiredIdDocsStatus`,
    );
  }

  /**
   * Generate a WebSDK access token for the frontend to render the Sumsub
   * verification flow in-browser.
   */
  async generateAccessToken(
    externalUserId: string,
    levelName: string,
  ): Promise<SumsubAccessToken> {
    const path =
      `/resources/accessTokens?userId=${encodeURIComponent(externalUserId)}` +
      `&levelName=${encodeURIComponent(levelName)}`;

    return this.request<SumsubAccessToken>("POST", path);
  }

  /**
   * Get the full verification result including individual check details.
   */
  async getVerificationResult(
    applicantId: string,
  ): Promise<SumsubVerificationResult> {
    return this.request<SumsubVerificationResult>(
      "GET",
      `/resources/applicants/${applicantId}/requiredIdDocsStatus`,
    );
  }
}
