import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReclaimVerificationService, hashProofIdentifier } from "../services/reclaim/verification.service.js";
import type { ReclaimProof } from "@payclear/sdk/src/utils/reclaim-types.js";

// Mock the config module
vi.mock("../config.js", () => ({
  config: {
    reclaim: {
      appId: "test-app-id",
      appSecret: "test-app-secret",
      trustedAttestors: ["attestor-1", "attestor-2"],
      proofTtlSeconds: 86400, // 24 hours
    },
  },
}));

function createValidProof(overrides?: Partial<ReclaimProof>): ReclaimProof {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    identifier: "proof-id-12345",
    claimData: {
      provider: "sumsub-kyc-verification",
      parameters: JSON.stringify({ walletAddress: "SoLWaLLeTaDdReSs1111111111111111111111111" }),
      context: '{"walletAddress":"SoLWaLLeTaDdReSs1111111111111111111111111"}',
      identifier: "claim-id-12345",
      epoch: 1,
      timestampS: nowSeconds - 60, // 1 minute ago
    },
    signatures: ["sig-abc-123"],
    witnesses: [
      { id: "attestor-1", url: "https://witness1.reclaimprotocol.org" },
    ],
    extractedParameterValues: {
      kycProvider: "sumsub",
      kycLevel: "enhanced",
      verificationStatus: "approved",
      jurisdiction: "US",
      verifiedAt: new Date().toISOString(),
      walletAddress: "SoLWaLLeTaDdReSs1111111111111111111111111",
    },
    ...overrides,
  };
}

describe("ReclaimVerificationService", () => {
  let service: ReclaimVerificationService;

  beforeEach(() => {
    service = new ReclaimVerificationService();
  });

  describe("verifyProof", () => {
    it("should verify a valid proof", async () => {
      const proof = createValidProof();
      const result = await service.verifyProof(proof);

      expect(result.valid).toBe(true);
      expect(result.kycLevel).toBe(2); // enhanced = 2
      expect(result.kycClaim).not.toBeNull();
      expect(result.kycClaim!.kycProvider).toBe("sumsub");
      expect(result.kycClaim!.verificationStatus).toBe("approved");
    });

    it("should reject a proof with no trusted attestor", async () => {
      const proof = createValidProof({
        witnesses: [{ id: "untrusted-attestor", url: "https://evil.com" }],
      });

      const result = await service.verifyProof(proof);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("No trusted attestor");
    });

    it("should reject a proof with no signatures", async () => {
      const proof = createValidProof({ signatures: [] });

      const result = await service.verifyProof(proof);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("no signatures");
    });

    it("should reject an expired proof", async () => {
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 100000; // ~27 hours ago
      const proof = createValidProof({
        claimData: {
          ...createValidProof().claimData,
          timestampS: expiredTimestamp,
        },
      });

      const result = await service.verifyProof(proof);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("expired");
    });

    it("should reject a proof with future timestamp", async () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 600; // 10 minutes in the future
      const proof = createValidProof({
        claimData: {
          ...createValidProof().claimData,
          timestampS: futureTimestamp,
        },
      });

      const result = await service.verifyProof(proof);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("future");
    });

    it("should reject a proof with unaccepted provider", async () => {
      const proof = createValidProof({
        extractedParameterValues: {
          ...createValidProof().extractedParameterValues,
          kycProvider: "unknown-provider",
        },
      });

      const result = await service.verifyProof(proof);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("not accepted");
    });

    it("should reject a proof with non-approved verification status", async () => {
      const proof = createValidProof({
        extractedParameterValues: {
          ...createValidProof().extractedParameterValues,
          verificationStatus: "pending",
        },
      });

      const result = await service.verifyProof(proof);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("not approved");
    });

    it("should reject a proof with missing KYC parameters", async () => {
      const proof = createValidProof({
        extractedParameterValues: {
          kycProvider: "sumsub",
          // missing kycLevel, verificationStatus, etc.
        },
      });

      const result = await service.verifyProof(proof);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Could not extract");
    });
  });

  describe("mapReclaimKycLevel", () => {
    it("should map sumsub basic to level 1", () => {
      expect(service.mapReclaimKycLevel("sumsub", "basic")).toBe(1);
    });

    it("should map sumsub enhanced to level 2", () => {
      expect(service.mapReclaimKycLevel("sumsub", "enhanced")).toBe(2);
    });

    it("should map sumsub institutional to level 3", () => {
      expect(service.mapReclaimKycLevel("sumsub", "institutional")).toBe(3);
    });

    it("should map jumio basic to level 1", () => {
      expect(service.mapReclaimKycLevel("jumio", "basic")).toBe(1);
    });

    it("should map onfido enhanced to level 2", () => {
      expect(service.mapReclaimKycLevel("onfido", "enhanced")).toBe(2);
    });

    it("should return 0 for unknown provider", () => {
      expect(service.mapReclaimKycLevel("unknown", "basic")).toBe(0);
    });

    it("should return 0 for unknown level", () => {
      expect(service.mapReclaimKycLevel("sumsub", "unknown-level")).toBe(0);
    });

    it("should be case-insensitive", () => {
      expect(service.mapReclaimKycLevel("SUMSUB", "ENHANCED")).toBe(2);
    });
  });

  describe("createProofRequest", () => {
    it("should generate a valid proof request", () => {
      const request = service.createProofRequest(
        "SoLWaLLeTaDdReSs1111111111111111111111111",
        2,
        ["sumsub", "jumio"]
      );

      expect(request.requestId).toBeDefined();
      expect(request.requestUrl).toContain("reclaimprotocol.org");
      expect(request.requestUrl).toContain("SoLWaLLeTaDdReSs1111111111111111111111111");
      expect(request.requestUrl).toContain("sumsub");
      expect(request.walletAddress).toBe("SoLWaLLeTaDdReSs1111111111111111111111111");
      expect(request.requiredKycLevel).toBe(2);
      expect(request.acceptedProviders).toEqual(["sumsub", "jumio"]);
      expect(request.expiresAt).toBeDefined();
    });

    it("should include QR code data matching the request URL", () => {
      const request = service.createProofRequest(
        "SoLWaLLeTaDdReSs1111111111111111111111111",
        1,
        ["sumsub"]
      );

      expect(request.qrCodeData).toBe(request.requestUrl);
    });
  });

  describe("isAttestorTrusted", () => {
    it("should return true for configured attestors", () => {
      expect(service.isAttestorTrusted("attestor-1")).toBe(true);
      expect(service.isAttestorTrusted("attestor-2")).toBe(true);
    });

    it("should return false for unknown attestors", () => {
      expect(service.isAttestorTrusted("evil-attestor")).toBe(false);
    });
  });

  describe("proof uniqueness", () => {
    it("should produce consistent proof identifier hashes", () => {
      const hash1 = hashProofIdentifier("proof-id-12345");
      const hash2 = hashProofIdentifier("proof-id-12345");

      expect(hash1.equals(hash2)).toBe(true);
      expect(hash1.length).toBe(32);
    });

    it("should produce different hashes for different identifiers", () => {
      const hash1 = hashProofIdentifier("proof-id-12345");
      const hash2 = hashProofIdentifier("proof-id-67890");

      expect(hash1.equals(hash2)).toBe(false);
    });
  });
});
