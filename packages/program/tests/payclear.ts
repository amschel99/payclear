const anchor = require("@coral-xyz/anchor");
const { Program } = anchor;
const { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const { createMint, createAssociatedTokenAccount, mintTo, getAccount, TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const { expect } = require("chai");
const { createHash } = require("crypto");
const { readFileSync } = require("fs");
const { join } = require("path");
const BN = require("bn.js");

// Program ID — must match deployed devnet program
const PROGRAM_ID = new PublicKey(
  "71F2kpdL4ezapNYLGHFCxcBBLTfHyXqsA2BZ2YxKaR8e"
);

// PDA seeds
const REGISTRY_SEED = Buffer.from("registry");
const INSTITUTION_SEED = Buffer.from("institution");
const KYC_SEED = Buffer.from("kyc");
const POLICY_SEED = Buffer.from("policy");
const TRANSFER_SEED = Buffer.from("transfer");
const TRAVEL_RULE_SEED = Buffer.from("travel_rule");

function sha256(data: string): Buffer {
  return createHash("sha256").update(data).digest();
}

function deriveRegistryPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([REGISTRY_SEED], PROGRAM_ID);
}

function deriveInstitutionPDA(
  institutionId: Buffer
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [INSTITUTION_SEED, institutionId],
    PROGRAM_ID
  );
}

function deriveKycAttestationPDA(
  institutionPda: PublicKey,
  wallet: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [KYC_SEED, institutionPda.toBuffer(), wallet.toBuffer()],
    PROGRAM_ID
  );
}

function derivePolicyPDA(
  institutionPda: PublicKey,
  policyId: Buffer
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POLICY_SEED, institutionPda.toBuffer(), policyId],
    PROGRAM_ID
  );
}

function deriveTransferPDA(nonce: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TRANSFER_SEED, nonce],
    PROGRAM_ID
  );
}

function deriveTravelRulePDA(nonce: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TRAVEL_RULE_SEED, nonce],
    PROGRAM_ID
  );
}

describe("PayClear Integration Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load IDL from committed idl/ directory (target/ is gitignored)
  const idl = JSON.parse(
    readFileSync(join(process.cwd(), "idl", "payclear.json"), "utf-8")
  );
  idl.metadata = { address: PROGRAM_ID.toBase58() };
  const program = new Program(idl, provider) as any;

  const authority = provider.wallet as anchor.Wallet;
  const institutionAuthority = Keypair.generate();
  const senderWallet = Keypair.generate();
  const receiverWallet = Keypair.generate();

  const institutionId = sha256("TestInstitution001");
  const vaspCode = Buffer.alloc(16);
  Buffer.from("VASP001").copy(vaspCode);
  const jurisdiction = Buffer.from("US");

  let registryPda: PublicKey;
  let institutionPda: PublicKey;
  let senderAttestationPda: PublicKey;
  let receiverAttestationPda: PublicKey;
  let mint: PublicKey;
  let senderTokenAccount: PublicKey;
  let receiverTokenAccount: PublicKey;

  before(async () => {
    // Derive PDAs
    [registryPda] = deriveRegistryPDA();
    [institutionPda] = deriveInstitutionPDA(institutionId);
    [senderAttestationPda] = deriveKycAttestationPDA(
      institutionPda,
      senderWallet.publicKey
    );
    [receiverAttestationPda] = deriveKycAttestationPDA(
      institutionPda,
      receiverWallet.publicKey
    );

    // Fund test wallets from the main authority wallet (avoids airdrop rate limits)
    const fundTx = new anchor.web3.Transaction();
    for (const [dest, amount] of [
      [institutionAuthority.publicKey, 0.5 * LAMPORTS_PER_SOL],
      [senderWallet.publicKey, 0.5 * LAMPORTS_PER_SOL],
      [receiverWallet.publicKey, 0.2 * LAMPORTS_PER_SOL],
    ] as [PublicKey, number][]) {
      fundTx.add(
        SystemProgram.transfer({
          fromPubkey: authority.publicKey,
          toPubkey: dest,
          lamports: amount,
        })
      );
    }
    const sig = await provider.sendAndConfirm(fundTx);
    console.log("    Funded test wallets. Tx:", sig);
  });

  // ─── Test 1: Initialize Registry ──────────────────────────

  it("initializes the registry", async () => {
    try {
      const tx = await program.methods
        .initializeRegistry()
        .accounts({
          registry: registryPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("    Registry initialized. Tx:", tx);

      const registry = await program.account.registry.fetch(registryPda);
      expect(registry.authority.toString()).to.equal(
        authority.publicKey.toString()
      );
      expect(registry.institutionCount.toNumber()).to.equal(0);
      expect(registry.paused).to.equal(false);
    } catch (e: any) {
      // Registry may already exist if test was run before
      if (e.message?.includes("already in use")) {
        console.log("    Registry already initialized (skipping)");
        const registry = await program.account.registry.fetch(registryPda);
        expect(registry.authority).to.not.be.null;
      } else {
        throw e;
      }
    }
  });

  // ─── Test 2: Register Institution ────────────────────────

  it("registers an institution", async () => {
    try {
      const tx = await program.methods
        .registerInstitution(
          Array.from(institutionId),
          Array.from(vaspCode),
          Array.from(jurisdiction)
        )
        .accounts({
          registry: registryPda,
          institution: institutionPda,
          institutionAuthority: institutionAuthority.publicKey,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("    Institution registered. Tx:", tx);

      const institution = await program.account.institution.fetch(
        institutionPda
      );
      expect(institution.active).to.equal(true);
      expect(
        Buffer.from(institution.jurisdiction).toString()
      ).to.equal("US");
      expect(institution.authority.toString()).to.equal(
        institutionAuthority.publicKey.toString()
      );
    } catch (e: any) {
      if (e.message?.includes("already in use")) {
        console.log("    Institution already registered (skipping)");
      } else {
        throw e;
      }
    }
  });

  // ─── Test 3: Create KYC Attestation for Sender ──────────

  it("creates a KYC attestation for the sender", async () => {
    const kycHash = sha256("sender-kyc-data-hash");
    const kycLevel = 2; // Enhanced
    const riskScore = 15;
    const expiresAt = Math.floor(Date.now() / 1000) + 86400 * 365; // 1 year

    try {
      const tx = await program.methods
        .createKycAttestation(
          Array.from(kycHash),
          kycLevel,
          riskScore,
          new BN(expiresAt)
        )
        .accounts({
          registry: registryPda,
          institution: institutionPda,
          wallet: senderWallet.publicKey,
          attestation: senderAttestationPda,
          authority: institutionAuthority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([institutionAuthority])
        .rpc();

      console.log("    Sender KYC attestation created. Tx:", tx);

      const attestation = await program.account.kycAttestation.fetch(
        senderAttestationPda
      );
      expect(attestation.kycLevel).to.equal(kycLevel);
      expect(attestation.riskScore).to.equal(riskScore);
      expect(attestation.status).to.equal(1); // Active
      expect(attestation.wallet.toString()).to.equal(
        senderWallet.publicKey.toString()
      );
    } catch (e: any) {
      if (e.message?.includes("already in use")) {
        console.log("    Sender attestation already exists (skipping)");
      } else {
        throw e;
      }
    }
  });

  // ─── Test 4: Create KYC Attestation for Receiver ────────

  it("creates a KYC attestation for the receiver", async () => {
    const kycHash = sha256("receiver-kyc-data-hash");
    const kycLevel = 2;
    const riskScore = 10;
    const expiresAt = Math.floor(Date.now() / 1000) + 86400 * 365;

    try {
      const tx = await program.methods
        .createKycAttestation(
          Array.from(kycHash),
          kycLevel,
          riskScore,
          new BN(expiresAt)
        )
        .accounts({
          registry: registryPda,
          institution: institutionPda,
          wallet: receiverWallet.publicKey,
          attestation: receiverAttestationPda,
          authority: institutionAuthority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([institutionAuthority])
        .rpc();

      console.log("    Receiver KYC attestation created. Tx:", tx);

      const attestation = await program.account.kycAttestation.fetch(
        receiverAttestationPda
      );
      expect(attestation.kycLevel).to.equal(kycLevel);
      expect(attestation.riskScore).to.equal(riskScore);
      expect(attestation.status).to.equal(1);
    } catch (e: any) {
      if (e.message?.includes("already in use")) {
        console.log("    Receiver attestation already exists (skipping)");
      } else {
        throw e;
      }
    }
  });

  // ─── Test 5: Update Risk Score ───────────────────────────

  it("updates the sender risk score", async () => {
    const newRiskScore = 25;

    const tx = await program.methods
      .updateRiskScore(newRiskScore)
      .accounts({
        institution: institutionPda,
        attestation: senderAttestationPda,
        authority: institutionAuthority.publicKey,
      })
      .signers([institutionAuthority])
      .rpc();

    console.log("    Risk score updated. Tx:", tx);

    const attestation = await program.account.kycAttestation.fetch(
      senderAttestationPda
    );
    expect(attestation.riskScore).to.equal(newRiskScore);
  });

  // ─── Test 6: Set Compliance Policy ──────────────────────

  let policyId: Buffer;
  let policyPda: PublicKey;

  it("creates a compliance policy", async () => {
    policyId = sha256("default-policy");
    [policyPda] = derivePolicyPDA(institutionPda, policyId);

    const params = {
      policyId: Array.from(policyId),
      minKycLevel: 1,
      maxRiskScore: 70,
      travelRuleThreshold: new BN(1_000_000_000), // 1000 USDC
      requireBothAttested: true,
      allowedJurisdictions: Array.from(Buffer.alloc(64)),
      blockedJurisdictions: Array.from(Buffer.alloc(64)),
      maxTransferAmount: new BN(0), // unlimited
      dailyLimit: new BN(0), // unlimited
      requireCivicPass: false,
      gatekeeperNetwork: PublicKey.default,
    };

    try {
      const tx = await program.methods
        .setCompliancePolicy(params)
        .accounts({
          institution: institutionPda,
          policy: policyPda,
          authority: institutionAuthority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([institutionAuthority])
        .rpc();

      console.log("    Compliance policy created. Tx:", tx);

      const policy = await program.account.compliancePolicy.fetch(policyPda);
      expect(policy.minKycLevel).to.equal(1);
      expect(policy.maxRiskScore).to.equal(70);
      expect(policy.active).to.equal(true);
    } catch (e: any) {
      if (e.message?.includes("already in use")) {
        console.log("    Policy already exists (skipping)");
        [policyPda] = derivePolicyPDA(institutionPda, policyId);
      } else {
        throw e;
      }
    }
  });

  // ─── Test 7: Execute Compliant Transfer ──────────────────

  it("executes a compliant token transfer", async () => {
    // Create a test SPL token mint
    mint = await createMint(
      provider.connection,
      (authority as any).payer,
      authority.publicKey,
      null,
      6 // 6 decimals (like USDC)
    );

    // Create token accounts
    senderTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      senderWallet,
      mint,
      senderWallet.publicKey
    );

    receiverTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      receiverWallet,
      mint,
      receiverWallet.publicKey
    );

    // Mint tokens to sender (1000 tokens)
    await mintTo(
      provider.connection,
      (authority as any).payer,
      mint,
      senderTokenAccount,
      authority.publicKey,
      1_000_000_000 // 1000 tokens with 6 decimals
    );

    // Verify sender balance
    const senderAccount = await getAccount(
      provider.connection,
      senderTokenAccount
    );
    expect(Number(senderAccount.amount)).to.equal(1_000_000_000);

    // Generate transfer nonce
    const nonce = sha256("test-transfer-nonce-" + Date.now());
    const [transferRecordPda] = deriveTransferPDA(nonce);
    const amount = new BN(100_000_000); // 100 tokens

    const tx = await program.methods
      .executeCompliantTransfer(Array.from(nonce), amount)
      .accounts({
        sender: senderWallet.publicKey,
        senderTokenAccount,
        receiverTokenAccount,
        mint,
        senderAttestation: senderAttestationPda,
        receiverAttestation: receiverAttestationPda,
        receiverWallet: receiverWallet.publicKey,
        compliancePolicy: policyPda,
        travelRuleRecord: null,
        transferRecord: transferRecordPda,
        registry: registryPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([senderWallet])
      .rpc();

    console.log("    Compliant transfer executed. Tx:", tx);

    // Verify transfer record
    const record = await program.account.transferRecord.fetch(
      transferRecordPda
    );
    expect(record.sender.toString()).to.equal(
      senderWallet.publicKey.toString()
    );
    expect(record.receiver.toString()).to.equal(
      receiverWallet.publicKey.toString()
    );
    expect(record.amount.toNumber()).to.equal(100_000_000);
    expect(record.status).to.equal(1); // Completed

    // Verify token balances
    const senderFinal = await getAccount(
      provider.connection,
      senderTokenAccount
    );
    const receiverFinal = await getAccount(
      provider.connection,
      receiverTokenAccount
    );
    expect(Number(senderFinal.amount)).to.equal(900_000_000);
    expect(Number(receiverFinal.amount)).to.equal(100_000_000);
  });

  // ─── Test 8: Revoke KYC Attestation ─────────────────────

  it("revokes a KYC attestation", async () => {
    const tx = await program.methods
      .revokeKycAttestation()
      .accounts({
        institution: institutionPda,
        attestation: receiverAttestationPda,
        authority: institutionAuthority.publicKey,
      })
      .signers([institutionAuthority])
      .rpc();

    console.log("    Receiver attestation revoked. Tx:", tx);

    const attestation = await program.account.kycAttestation.fetch(
      receiverAttestationPda
    );
    expect(attestation.status).to.equal(3); // Revoked
  });

  // ─── Test 9: Transfer fails with revoked attestation ────

  it("rejects transfer when receiver attestation is revoked", async () => {
    const nonce = sha256("test-transfer-should-fail-" + Date.now());
    const [transferRecordPda] = deriveTransferPDA(nonce);
    const amount = new BN(50_000_000);

    try {
      await program.methods
        .executeCompliantTransfer(Array.from(nonce), amount)
        .accounts({
          sender: senderWallet.publicKey,
          senderTokenAccount,
          receiverTokenAccount,
          mint,
          senderAttestation: senderAttestationPda,
          receiverAttestation: receiverAttestationPda,
          receiverWallet: receiverWallet.publicKey,
          compliancePolicy: policyPda,
          travelRuleRecord: null,
          transferRecord: transferRecordPda,
          registry: registryPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([senderWallet])
        .rpc();

      // Should not reach here
      expect.fail("Transfer should have been rejected");
    } catch (e: any) {
      console.log("    Transfer correctly rejected:", e.error?.errorCode?.code || e.message);
      expect(
        e.error?.errorCode?.code === "AttestationNotActive" ||
        e.message?.includes("AttestationNotActive")
      ).to.be.true;
    }
  });

  // ─── Test 10: Unauthorized institution cannot create attestation ──

  it("rejects attestation from unauthorized authority", async () => {
    const fakeAuthority = Keypair.generate();
    const fundTx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: fakeAuthority.publicKey,
        lamports: 0.1 * LAMPORTS_PER_SOL,
      })
    );
    await provider.sendAndConfirm(fundTx);

    const randomWallet = Keypair.generate();
    const [attestationPda] = deriveKycAttestationPDA(
      institutionPda,
      randomWallet.publicKey
    );

    const kycHash = sha256("fake-kyc-data");

    try {
      await program.methods
        .createKycAttestation(
          Array.from(kycHash),
          1,
          10,
          new BN(0)
        )
        .accounts({
          registry: registryPda,
          institution: institutionPda,
          wallet: randomWallet.publicKey,
          attestation: attestationPda,
          authority: fakeAuthority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([fakeAuthority])
        .rpc();

      expect.fail("Should have rejected unauthorized authority");
    } catch (e: any) {
      console.log("    Correctly rejected unauthorized:", e.error?.errorCode?.code || "constraint violated");
      expect(
        e.error?.errorCode?.code === "UnauthorizedInstitution" ||
        e.message?.includes("Unauthorized") ||
        e.message?.includes("constraint")
      ).to.be.true;
    }
  });
});
