import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";
import { deriveZkProofPDA } from "../accounts/pda.js";
import { ACCEPTED_KYC_PROVIDERS } from "../utils/reclaim-types.js";

describe("ZkProofRecord PDA derivation", () => {
  const programId = new PublicKey("PCLRxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
  const institution = PublicKey.unique();
  const wallet = PublicKey.unique();

  it("should derive a deterministic PDA for a given proof identifier", () => {
    const proofIdentifier = createHash("sha256")
      .update("reclaim-proof-001")
      .digest();

    const [pda1, bump1] = deriveZkProofPDA(
      institution,
      wallet,
      proofIdentifier,
      programId
    );
    const [pda2, bump2] = deriveZkProofPDA(
      institution,
      wallet,
      proofIdentifier,
      programId
    );

    expect(pda1.equals(pda2)).toBe(true);
    expect(bump1).toBe(bump2);
  });

  it("should derive different PDAs for different proof identifiers", () => {
    const id1 = createHash("sha256").update("proof-A").digest();
    const id2 = createHash("sha256").update("proof-B").digest();

    const [pda1] = deriveZkProofPDA(institution, wallet, id1, programId);
    const [pda2] = deriveZkProofPDA(institution, wallet, id2, programId);

    expect(pda1.equals(pda2)).toBe(false);
  });

  it("should derive different PDAs for different wallets", () => {
    const proofId = createHash("sha256").update("same-proof").digest();
    const wallet2 = PublicKey.unique();

    const [pda1] = deriveZkProofPDA(
      institution,
      wallet,
      proofId,
      programId
    );
    const [pda2] = deriveZkProofPDA(
      institution,
      wallet2,
      proofId,
      programId
    );

    expect(pda1.equals(pda2)).toBe(false);
  });

  it("should derive different PDAs for different institutions", () => {
    const proofId = createHash("sha256").update("same-proof").digest();
    const institution2 = PublicKey.unique();

    const [pda1] = deriveZkProofPDA(
      institution,
      wallet,
      proofId,
      programId
    );
    const [pda2] = deriveZkProofPDA(
      institution2,
      wallet,
      proofId,
      programId
    );

    expect(pda1.equals(pda2)).toBe(false);
  });
});

describe("Proof identifier hashing", () => {
  it("should produce a 32-byte SHA-256 hash", () => {
    const hash = createHash("sha256")
      .update("reclaim-proof-identifier-123")
      .digest();

    expect(hash.length).toBe(32);
    expect(Buffer.isBuffer(hash)).toBe(true);
  });

  it("should be deterministic", () => {
    const input = "proof-xyz-789";
    const hash1 = createHash("sha256").update(input).digest();
    const hash2 = createHash("sha256").update(input).digest();

    expect(hash1.equals(hash2)).toBe(true);
  });

  it("should produce unique hashes for unique inputs", () => {
    const hash1 = createHash("sha256").update("proof-1").digest();
    const hash2 = createHash("sha256").update("proof-2").digest();

    expect(hash1.equals(hash2)).toBe(false);
  });
});

describe("ACCEPTED_KYC_PROVIDERS", () => {
  it("should include sumsub, jumio, and onfido", () => {
    expect(ACCEPTED_KYC_PROVIDERS).toHaveProperty("sumsub");
    expect(ACCEPTED_KYC_PROVIDERS).toHaveProperty("jumio");
    expect(ACCEPTED_KYC_PROVIDERS).toHaveProperty("onfido");
  });

  it("should map basic levels to 1", () => {
    expect(ACCEPTED_KYC_PROVIDERS.sumsub["basic"]).toBe(1);
    expect(ACCEPTED_KYC_PROVIDERS.jumio["basic"]).toBe(1);
    expect(ACCEPTED_KYC_PROVIDERS.onfido["basic"]).toBe(1);
  });

  it("should map enhanced levels to 2", () => {
    expect(ACCEPTED_KYC_PROVIDERS.sumsub["enhanced"]).toBe(2);
    expect(ACCEPTED_KYC_PROVIDERS.jumio["enhanced"]).toBe(2);
    expect(ACCEPTED_KYC_PROVIDERS.onfido["enhanced"]).toBe(2);
  });

  it("should map institutional levels to 3", () => {
    expect(ACCEPTED_KYC_PROVIDERS.sumsub["institutional"]).toBe(3);
    expect(ACCEPTED_KYC_PROVIDERS.jumio["institutional"]).toBe(3);
    expect(ACCEPTED_KYC_PROVIDERS.onfido["institutional"]).toBe(3);
  });
});
