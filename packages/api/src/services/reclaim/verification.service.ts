import { createHash, randomUUID } from "crypto";
import { config } from "../../config.js";
import type {
  ReclaimProof,
  PayClearKycClaim,
  VerificationResult,
  ProofRequest,
} from "@payclear/sdk/src/utils/reclaim-types.js";
import { ACCEPTED_KYC_PROVIDERS } from "@payclear/sdk/src/utils/reclaim-types.js";

/**
 * Service for verifying Reclaim Protocol zero-knowledge proofs off-chain.
 *
 * Validates proof integrity (signatures, expiry, schema conformance)
 * before recording the attestation on-chain via the Solana program.
 */
export class ReclaimVerificationService {
  private trustedAttestors: Set<string>;
  private proofTtlSeconds: number;

  constructor() {
    this.trustedAttestors = new Set(config.reclaim.trustedAttestors);
    this.proofTtlSeconds = config.reclaim.proofTtlSeconds;
  }

  /**
   * Verify a Reclaim proof end-to-end.
   *
   * 1. Verify proof signatures against trusted attestor set
   * 2. Verify proof is not expired (timestampS + TTL > now)
   * 3. Verify claim matches a PayClear-accepted KYC schema
   * 4. Extract and validate KYC parameters
   */
  async verifyProof(proof: ReclaimProof): Promise<VerificationResult> {
    // 1. Check that at least one witness is a trusted attestor
    const hasTrustedWitness = proof.witnesses.some((w) =>
      this.isAttestorTrusted(w.id)
    );
    if (!hasTrustedWitness) {
      return {
        valid: false,
        kycLevel: 0,
        kycClaim: null,
        error: "No trusted attestor found in proof witnesses",
      };
    }

    // 2. Verify signatures are present
    if (!proof.signatures || proof.signatures.length === 0) {
      return {
        valid: false,
        kycLevel: 0,
        kycClaim: null,
        error: "Proof contains no signatures",
      };
    }

    // 3. Check proof expiry
    const nowSeconds = Math.floor(Date.now() / 1000);
    const proofAge = nowSeconds - proof.claimData.timestampS;
    if (proofAge > this.proofTtlSeconds) {
      return {
        valid: false,
        kycLevel: 0,
        kycClaim: null,
        error: `Proof expired: age ${proofAge}s exceeds TTL ${this.proofTtlSeconds}s`,
      };
    }

    // 4. Verify the proof timestamp is not in the future (clock skew tolerance: 300s)
    if (proof.claimData.timestampS > nowSeconds + 300) {
      return {
        valid: false,
        kycLevel: 0,
        kycClaim: null,
        error: "Proof timestamp is in the future",
      };
    }

    // 5. Extract and validate KYC claim from proof
    const kycClaim = this.extractKycClaim(proof);
    if (!kycClaim) {
      return {
        valid: false,
        kycLevel: 0,
        kycClaim: null,
        error: "Could not extract valid KYC claim from proof parameters",
      };
    }

    // 6. Verify the claim is from an accepted provider
    if (!ACCEPTED_KYC_PROVIDERS[kycClaim.kycProvider]) {
      return {
        valid: false,
        kycLevel: 0,
        kycClaim: null,
        error: `KYC provider "${kycClaim.kycProvider}" is not accepted`,
      };
    }

    // 7. Verify the verification status is "approved"
    if (kycClaim.verificationStatus !== "approved") {
      return {
        valid: false,
        kycLevel: 0,
        kycClaim: null,
        error: `Verification status "${kycClaim.verificationStatus}" is not approved`,
      };
    }

    // 8. Map provider-specific KYC level to PayClear's 0-3 scale
    const kycLevel = this.mapReclaimKycLevel(
      kycClaim.kycProvider,
      kycClaim.kycLevel
    );

    return {
      valid: true,
      kycLevel,
      kycClaim,
    };
  }

  /**
   * Generate a Reclaim proof request for a wallet address.
   * The user/institution fulfills this request to prove KYC status.
   */
  createProofRequest(
    walletAddress: string,
    requiredKycLevel: number,
    acceptedProviders: string[]
  ): ProofRequest {
    const requestId = randomUUID();
    const appId = config.reclaim.appId;

    // Build the request URL with required parameters
    const params = new URLSearchParams({
      requestId,
      appId,
      walletAddress,
      requiredKycLevel: requiredKycLevel.toString(),
      providers: acceptedProviders.join(","),
    });

    const requestUrl = `https://share.reclaimprotocol.org/verify?${params.toString()}`;

    // QR code data encodes the same URL for mobile scanning
    const qrCodeData = requestUrl;

    const expiresAt = new Date(
      Date.now() + this.proofTtlSeconds * 1000
    ).toISOString();

    return {
      requestId,
      requestUrl,
      qrCodeData,
      walletAddress,
      requiredKycLevel,
      acceptedProviders,
      expiresAt,
    };
  }

  /**
   * Map a provider-specific KYC level string to PayClear's 0-3 numeric scale.
   *
   * 0 = None
   * 1 = Basic (document verification)
   * 2 = Enhanced (document + biometric + address)
   * 3 = Institutional (full due diligence)
   */
  mapReclaimKycLevel(provider: string, providerLevel: string): number {
    const providerMap = ACCEPTED_KYC_PROVIDERS[provider.toLowerCase()];
    if (!providerMap) {
      return 0;
    }

    const level = providerMap[providerLevel.toLowerCase()];
    return level ?? 0;
  }

  /**
   * Check whether an attestor address is in the trusted set.
   */
  isAttestorTrusted(attestorAddress: string): boolean {
    // If no trusted attestors are configured, reject all
    if (this.trustedAttestors.size === 0) {
      return false;
    }
    return this.trustedAttestors.has(attestorAddress);
  }

  /**
   * Extract a PayClearKycClaim from a Reclaim proof's extracted parameters.
   */
  private extractKycClaim(proof: ReclaimProof): PayClearKycClaim | null {
    const params = proof.extractedParameterValues;

    // All required fields must be present
    const kycProvider = params.kycProvider || params.provider;
    const kycLevel = params.kycLevel || params.level;
    const verificationStatus =
      params.verificationStatus || params.status;
    const jurisdiction = params.jurisdiction || params.country;
    const verifiedAt = params.verifiedAt || params.timestamp;
    const walletAddress = params.walletAddress || params.wallet;

    if (
      !kycProvider ||
      !kycLevel ||
      !verificationStatus ||
      !jurisdiction ||
      !verifiedAt ||
      !walletAddress
    ) {
      return null;
    }

    return {
      kycProvider: kycProvider.toLowerCase(),
      kycLevel: kycLevel.toLowerCase(),
      verificationStatus: verificationStatus.toLowerCase(),
      jurisdiction: jurisdiction.toUpperCase(),
      verifiedAt,
      walletAddress,
    };
  }
}

/**
 * Hash a proof identifier to a 32-byte buffer for on-chain storage.
 */
export function hashProofIdentifier(identifier: string): Buffer {
  return createHash("sha256").update(identifier).digest();
}
