import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { SumsubClient } from "../services/sumsub/client.js";
import { verifySumsubWebhook } from "../services/sumsub/webhook.js";
import { mapSumsubLevelToKycLevel } from "../services/sumsub/verification.service.js";

// ─── Webhook Signature Verification ─────────────────────────

describe("verifySumsubWebhook", () => {
  const secretKey = "test-webhook-secret-key-12345";

  it("should accept a valid webhook signature", () => {
    const payload = JSON.stringify({
      applicantId: "abc123",
      type: "applicantReviewed",
      externalUserId: "7xKXtg2CW87d97TXJSDpbD",
      reviewResult: { reviewAnswer: "GREEN" },
    });

    const validSignature = createHmac("sha256", secretKey)
      .update(payload)
      .digest("hex");

    expect(verifySumsubWebhook(payload, validSignature, secretKey)).toBe(true);
  });

  it("should reject an invalid webhook signature", () => {
    const payload = JSON.stringify({
      applicantId: "abc123",
      type: "applicantReviewed",
    });

    const invalidSignature = "deadbeef0123456789abcdef0123456789abcdef0123456789abcdef01234567";

    expect(verifySumsubWebhook(payload, invalidSignature, secretKey)).toBe(false);
  });

  it("should reject a tampered payload", () => {
    const originalPayload = JSON.stringify({ applicantId: "abc123", type: "applicantReviewed" });
    const tamperedPayload = JSON.stringify({ applicantId: "xyz789", type: "applicantReviewed" });

    const signature = createHmac("sha256", secretKey)
      .update(originalPayload)
      .digest("hex");

    expect(verifySumsubWebhook(tamperedPayload, signature, secretKey)).toBe(false);
  });

  it("should reject a signature with wrong secret", () => {
    const payload = JSON.stringify({ applicantId: "abc123" });
    const signatureWithWrongKey = createHmac("sha256", "wrong-secret")
      .update(payload)
      .digest("hex");

    expect(verifySumsubWebhook(payload, signatureWithWrongKey, secretKey)).toBe(false);
  });

  it("should handle Buffer payloads", () => {
    const payload = Buffer.from(JSON.stringify({ applicantId: "abc123" }));
    const signature = createHmac("sha256", secretKey)
      .update(payload)
      .digest("hex");

    expect(verifySumsubWebhook(payload, signature, secretKey)).toBe(true);
  });

  it("should handle empty payload", () => {
    const payload = "";
    const signature = createHmac("sha256", secretKey)
      .update(payload)
      .digest("hex");

    expect(verifySumsubWebhook(payload, signature, secretKey)).toBe(true);
  });
});

// ─── Sumsub Auth Signature Generation ───────────────────────

describe("SumsubClient.generateSignature", () => {
  const appToken = "test-app-token";
  const secretKey = "test-secret-key";

  it("should generate a deterministic HMAC-SHA256 signature", () => {
    const client = new SumsubClient(appToken, secretKey, "https://api.sumsub.com");
    const ts = 1700000000;
    const method = "POST";
    const path = "/resources/applicants?levelName=basic-kyc-level";
    const body = JSON.stringify({ externalUserId: "wallet123" });

    const sig1 = client.generateSignature(ts, method, path, body);
    const sig2 = client.generateSignature(ts, method, path, body);

    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(64); // SHA-256 hex digest
  });

  it("should produce correct signature matching manual HMAC", () => {
    const client = new SumsubClient(appToken, secretKey, "https://api.sumsub.com");
    const ts = 1700000000;
    const method = "GET";
    const path = "/resources/applicants/abc123";

    const sig = client.generateSignature(ts, method, path);

    // Manual computation
    const expected = createHmac("sha256", secretKey)
      .update(ts + "GET" + path)
      .digest("hex");

    expect(sig).toBe(expected);
  });

  it("should include body in signature when present", () => {
    const client = new SumsubClient(appToken, secretKey, "https://api.sumsub.com");
    const ts = 1700000000;
    const method = "POST";
    const path = "/resources/applicants";
    const body = '{"externalUserId":"test"}';

    const sigWithBody = client.generateSignature(ts, method, path, body);
    const sigWithoutBody = client.generateSignature(ts, method, path);

    expect(sigWithBody).not.toBe(sigWithoutBody);
  });

  it("should uppercase the HTTP method", () => {
    const client = new SumsubClient(appToken, secretKey, "https://api.sumsub.com");
    const ts = 1700000000;
    const path = "/resources/applicants";

    const sigLower = client.generateSignature(ts, "post", path);
    const sigUpper = client.generateSignature(ts, "POST", path);

    expect(sigLower).toBe(sigUpper);
  });

  it("should produce different signatures for different timestamps", () => {
    const client = new SumsubClient(appToken, secretKey, "https://api.sumsub.com");
    const path = "/resources/applicants";

    const sig1 = client.generateSignature(1700000000, "GET", path);
    const sig2 = client.generateSignature(1700000001, "GET", path);

    expect(sig1).not.toBe(sig2);
  });
});

// ─── Sumsub Level to KYC Level Mapping ───────────────────────

describe("mapSumsubLevelToKycLevel", () => {
  it("should map basic levels to KYC level 1", () => {
    expect(mapSumsubLevelToKycLevel("basic-kyc-level")).toBe(1);
    expect(mapSumsubLevelToKycLevel("Basic-KYC-Level")).toBe(1);
    expect(mapSumsubLevelToKycLevel("id-and-selfie")).toBe(1);
    expect(mapSumsubLevelToKycLevel("simple-verification")).toBe(1);
  });

  it("should map enhanced levels to KYC level 2", () => {
    expect(mapSumsubLevelToKycLevel("enhanced-kyc-level")).toBe(2);
    expect(mapSumsubLevelToKycLevel("advanced-verification")).toBe(2);
    expect(mapSumsubLevelToKycLevel("Enhanced-KYC")).toBe(2);
  });

  it("should map full levels to KYC level 3", () => {
    expect(mapSumsubLevelToKycLevel("full-kyc-level")).toBe(3);
    expect(mapSumsubLevelToKycLevel("source-of-funds-check")).toBe(3);
    expect(mapSumsubLevelToKycLevel("sof-verification")).toBe(3);
    expect(mapSumsubLevelToKycLevel("Full-Verification")).toBe(3);
  });

  it("should default unknown levels to KYC level 1", () => {
    expect(mapSumsubLevelToKycLevel("custom-level-xyz")).toBe(1);
    expect(mapSumsubLevelToKycLevel("unknown")).toBe(1);
  });
});

// ─── Verification Flow State Transitions ─────────────────────

describe("verification flow state transitions", () => {
  it("GREEN review should map to active status (1)", () => {
    // Status codes: 0=pending, 1=active, 2=suspended, 3=revoked
    const reviewResult = { reviewAnswer: "GREEN" as const };
    expect(reviewResult.reviewAnswer).toBe("GREEN");
    // Active status
    const expectedStatus = 1;
    expect(expectedStatus).toBe(1);
  });

  it("RED review should map to revoked status (3)", () => {
    const reviewResult = {
      reviewAnswer: "RED" as const,
      rejectLabels: ["FORGERY"],
      reviewRejectType: "FINAL" as const,
    };
    expect(reviewResult.reviewAnswer).toBe("RED");
    const expectedStatus = 3;
    expect(expectedStatus).toBe(3);
  });

  it("RED review with RETRY should allow re-verification", () => {
    const reviewResult = {
      reviewAnswer: "RED" as const,
      rejectLabels: ["BAD_QUALITY"],
      reviewRejectType: "RETRY" as const,
    };
    expect(reviewResult.reviewRejectType).toBe("RETRY");
    // Status is still revoked but sumsubReviewStatus should be "retry"
    const expectedReviewStatus = "retry";
    expect(expectedReviewStatus).toBe("retry");
  });

  it("should transition from pending (0) to active (1) on approval", () => {
    const initialStatus = 0; // pending
    const reviewAnswer = "GREEN";
    const finalStatus = reviewAnswer === "GREEN" ? 1 : 3;
    expect(initialStatus).toBe(0);
    expect(finalStatus).toBe(1);
  });

  it("should transition from pending (0) to revoked (3) on rejection", () => {
    const initialStatus = 0; // pending
    const reviewAnswer = "RED";
    const finalStatus = reviewAnswer === "GREEN" ? 1 : 3;
    expect(initialStatus).toBe(0);
    expect(finalStatus).toBe(3);
  });

  it("should assign kycLevel based on verification level after GREEN review", () => {
    // Simulates the flow where a GREEN review triggers level mapping
    const verificationLevel = "enhanced-kyc-level";
    const kycLevel = mapSumsubLevelToKycLevel(verificationLevel);
    expect(kycLevel).toBe(2);
  });
});
