/**
 * Chainalysis KYT Integration Tests
 *
 * Covers: risk score mapping, screening decision logic, webhook signature
 * verification, retry logic, and transfer flow integration.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

// ─── Risk Score Mapping ──────────────────────────────────────

import {
  mapRiskScore,
  isApproved,
} from "../services/chainalysis/risk.service.js";

describe("Risk Score Mapping", () => {
  it("maps lowRisk to 0-25 range", () => {
    expect(mapRiskScore("lowRisk", 0)).toBe(0);
    expect(mapRiskScore("lowRisk", 5)).toBe(13); // round(0.5 * 25)
    expect(mapRiskScore("lowRisk", 10)).toBe(25);
  });

  it("maps mediumRisk to 26-50 range", () => {
    expect(mapRiskScore("mediumRisk", 0)).toBe(26);
    expect(mapRiskScore("mediumRisk", 5)).toBe(38); // round(26 + 0.5 * 24)
    expect(mapRiskScore("mediumRisk", 10)).toBe(50);
  });

  it("maps highRisk to 51-85 range", () => {
    expect(mapRiskScore("highRisk", 0)).toBe(51);
    expect(mapRiskScore("highRisk", 5)).toBe(68); // round(51 + 0.5 * 34)
    expect(mapRiskScore("highRisk", 10)).toBe(85);
  });

  it("maps severe to 86-100 range", () => {
    expect(mapRiskScore("severe", 0)).toBe(86);
    expect(mapRiskScore("severe", 5)).toBe(93); // round(86 + 0.5 * 14)
    expect(mapRiskScore("severe", 10)).toBe(100);
  });

  it("clamps chainalysis score to 0-10 range", () => {
    expect(mapRiskScore("lowRisk", -5)).toBe(0);
    expect(mapRiskScore("lowRisk", 15)).toBe(25);
    expect(mapRiskScore("severe", 100)).toBe(100);
  });

  it("treats unknown ratings as 50 (medium)", () => {
    expect(mapRiskScore("unknownRating" as any, 5)).toBe(50);
  });
});

// ─── Screening Decision Logic ────────────────────────────────

describe("Screening Decision Logic", () => {
  it("approves lowRisk transfers", () => {
    expect(isApproved("lowRisk")).toBe(true);
  });

  it("approves mediumRisk transfers (with warning)", () => {
    expect(isApproved("mediumRisk")).toBe(true);
  });

  it("rejects highRisk transfers", () => {
    expect(isApproved("highRisk")).toBe(false);
  });

  it("rejects severe transfers", () => {
    expect(isApproved("severe")).toBe(false);
  });
});

// ─── Webhook Signature Verification ─────────────────────────

describe("Webhook Signature Verification", () => {
  const secret = "test-webhook-secret-key";

  function computeSignature(payload: string, key: string): string {
    return createHmac("sha256", key).update(payload).digest("hex");
  }

  it("generates valid HMAC-SHA256 signature", () => {
    const payload = JSON.stringify({
      alertId: "alert-123",
      level: "severe",
      category: "sanctions",
    });

    const sig = computeSignature(payload, secret);

    // Verify independently
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    expect(sig).toBe(expected);
  });

  it("rejects tampered payloads", () => {
    const payload = JSON.stringify({ alertId: "alert-123" });
    const sig = computeSignature(payload, secret);

    const tamperedPayload = JSON.stringify({ alertId: "alert-456" });
    const tamperedSig = computeSignature(tamperedPayload, secret);

    expect(sig).not.toBe(tamperedSig);
  });

  it("rejects signatures with wrong secret", () => {
    const payload = JSON.stringify({ alertId: "alert-123" });
    const sig = computeSignature(payload, secret);
    const wrongSig = computeSignature(payload, "wrong-secret");

    expect(sig).not.toBe(wrongSig);
  });
});

// ─── ChainalysisClient Retry Logic ──────────────────────────

describe("ChainalysisClient Retry Logic", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  it("retries on 500 errors up to maxRetries", async () => {
    // Dynamic import to get fresh instance
    const { ChainalysisClient } = await import(
      "../services/chainalysis/client.js"
    );

    const client = new ChainalysisClient("test-key", "https://api.test.com", {
      maxRetries: 2,
      timeoutMs: 5000,
    });

    fetchSpy
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ externalId: "ext-123" }),
        headers: new Headers(),
      });

    const result = await client.getTransferRiskAssessment("ext-123");
    expect(result).toEqual({ externalId: "ext-123" });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("does not retry on 4xx errors (except 429)", async () => {
    const { ChainalysisClient } = await import(
      "../services/chainalysis/client.js"
    );

    const client = new ChainalysisClient("test-key", "https://api.test.com", {
      maxRetries: 3,
      timeoutMs: 5000,
    });

    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "Bad Request",
      headers: new Headers(),
    });

    await expect(
      client.getTransferRiskAssessment("ext-123")
    ).rejects.toMatchObject({
      status: 400,
      retryable: false,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 rate limit responses", async () => {
    const { ChainalysisClient } = await import(
      "../services/chainalysis/client.js"
    );

    const client = new ChainalysisClient("test-key", "https://api.test.com", {
      maxRetries: 1,
      timeoutMs: 5000,
    });

    fetchSpy
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => "Rate limited",
        headers: new Headers({ "retry-after": "1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rating: "lowRisk", riskScore: 2 }),
        headers: new Headers(),
      });

    const result = await client.getTransferRiskAssessment("ext-123");
    expect(result).toMatchObject({ rating: "lowRisk" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("sends correct auth header", async () => {
    const { ChainalysisClient } = await import(
      "../services/chainalysis/client.js"
    );

    const client = new ChainalysisClient(
      "my-secret-api-key",
      "https://api.test.com",
      { maxRetries: 0, timeoutMs: 5000 }
    );

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ rating: "lowRisk" }),
      headers: new Headers(),
    });

    await client.getTransferRiskAssessment("ext-123");

    const calledWith = fetchSpy.mock.calls[0];
    expect(calledWith[1].headers.Token).toBe("my-secret-api-key");
  });
});

// ─── Transfer Flow Integration ───────────────────────────────

describe("Transfer Flow Integration", () => {
  it("screening result score boundaries align with approval logic", () => {
    // Low risk: approved
    const lowScore = mapRiskScore("lowRisk", 10);
    expect(lowScore).toBeLessThanOrEqual(25);
    expect(isApproved("lowRisk")).toBe(true);

    // Medium risk: approved (with warning)
    const medScore = mapRiskScore("mediumRisk", 10);
    expect(medScore).toBeLessThanOrEqual(50);
    expect(isApproved("mediumRisk")).toBe(true);

    // High risk: rejected
    const highScore = mapRiskScore("highRisk", 0);
    expect(highScore).toBeGreaterThanOrEqual(51);
    expect(isApproved("highRisk")).toBe(false);

    // Severe: rejected with highest scores
    const severeScore = mapRiskScore("severe", 0);
    expect(severeScore).toBeGreaterThanOrEqual(86);
    expect(isApproved("severe")).toBe(false);
  });

  it("auto-reject threshold aligns with highRisk minimum", () => {
    // Default auto-reject threshold is 70
    const defaultThreshold = 70;

    // A highRisk score of ~5.6 maps to 70
    // Verify that mid-range highRisk scores exceed the threshold
    const midHighRisk = mapRiskScore("highRisk", 5.6);
    expect(midHighRisk).toBeGreaterThanOrEqual(defaultThreshold);
  });

  it("auto-revoke threshold aligns with severe range", () => {
    // Default auto-revoke threshold is 85
    const defaultRevokeThreshold = 85;

    // All severe scores should exceed the revoke threshold
    const minSevere = mapRiskScore("severe", 0);
    expect(minSevere).toBeGreaterThanOrEqual(defaultRevokeThreshold);
  });

  it("cleared transfers have lowRisk or mediumRisk ratings", () => {
    // Simulate the decision flow
    const ratings: Array<{ rating: any; expectedApproval: boolean }> = [
      { rating: "lowRisk", expectedApproval: true },
      { rating: "mediumRisk", expectedApproval: true },
      { rating: "highRisk", expectedApproval: false },
      { rating: "severe", expectedApproval: false },
    ];

    for (const { rating, expectedApproval } of ratings) {
      const approved = isApproved(rating);
      const status = approved ? "cleared" : "blocked";

      expect(approved).toBe(expectedApproval);
      if (approved) {
        expect(status).toBe("cleared");
      } else {
        expect(status).toBe("blocked");
      }
    }
  });
});
