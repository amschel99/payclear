import { eq } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import { readFileSync } from "fs";
import { db } from "../db/client.js";
import { transfers, travelRuleData, institutions } from "../db/schema.js";
import { logAuditEvent } from "./audit.service.js";
import { config } from "../config.js";
import * as riskService from "./chainalysis/risk.service.js";
import type { SubmitTransferInput } from "../schemas/transfer.schema.js";
import { payclearIdl } from "@payclear/sdk";

function generateNonce(): string {
  return randomBytes(32).toString("hex");
}

function hashTravelRulePayload(data: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex");
}

export async function submitTransfer(
  institutionId: string,
  input: SubmitTransferInput,
  actor: string
) {
  const nonce = generateNonce();

  // If travel rule data is provided, store it first
  let travelRuleId: string | null = null;
  if (input.travelRule) {
    const originatorData = {
      name: input.travelRule.originatorName,
      account: input.travelRule.originatorAccount,
      addressStreet: input.travelRule.originatorAddressStreet,
      addressCity: input.travelRule.originatorAddressCity,
      addressCountry: input.travelRule.originatorAddressCountry,
      nationalId: input.travelRule.originatorNationalId,
      dob: input.travelRule.originatorDob,
      placeOfBirth: input.travelRule.originatorPlaceOfBirth,
    };

    const beneficiaryData = {
      name: input.travelRule.beneficiaryName,
      account: input.travelRule.beneficiaryAccount,
      addressStreet: input.travelRule.beneficiaryAddressStreet,
      addressCity: input.travelRule.beneficiaryAddressCity,
      addressCountry: input.travelRule.beneficiaryAddressCountry,
      institutionName: input.travelRule.beneficiaryInstitutionName,
    };

    const [travelRule] = await db
      .insert(travelRuleData)
      .values({
        nonce,
        originatorInstitutionId: institutionId,
        beneficiaryInstitutionId: input.travelRule.beneficiaryInstitutionId,
        originatorName: input.travelRule.originatorName,
        originatorAccount: input.travelRule.originatorAccount,
        originatorAddressStreet: input.travelRule.originatorAddressStreet,
        originatorAddressCity: input.travelRule.originatorAddressCity,
        originatorAddressCountry: input.travelRule.originatorAddressCountry,
        originatorNationalId: input.travelRule.originatorNationalId,
        originatorDob: input.travelRule.originatorDob,
        originatorPlaceOfBirth: input.travelRule.originatorPlaceOfBirth,
        beneficiaryName: input.travelRule.beneficiaryName,
        beneficiaryAccount: input.travelRule.beneficiaryAccount,
        beneficiaryAddressStreet: input.travelRule.beneficiaryAddressStreet,
        beneficiaryAddressCity: input.travelRule.beneficiaryAddressCity,
        beneficiaryAddressCountry: input.travelRule.beneficiaryAddressCountry,
        beneficiaryInstitutionName: input.travelRule.beneficiaryInstitutionName,
        originatorDataHash: hashTravelRulePayload(originatorData),
        beneficiaryDataHash: hashTravelRulePayload(beneficiaryData),
        amount: BigInt(input.amount),
        tokenMint: input.mint,
      })
      .returning();

    travelRuleId = travelRule.id;

    await logAuditEvent({
      institutionId,
      eventType: "travel_rule.created",
      entityType: "travel_rule",
      entityId: travelRule.id,
      actor,
      details: { nonce, amount: input.amount },
    });
  }

  // ─── Chainalysis KYT Screening (pre-execution) ──────────────
  let screeningStatus: string | null = null;
  let screeningId: string | null = null;

  if (config.chainalysis.apiKey) {
    try {
      const screenResult = await riskService.screenTransferPreExecution({
        institutionId,
        senderWallet: input.senderWallet,
        receiverWallet: input.receiverWallet,
        asset: input.mint,
        amount: Number(input.amount),
        transferReference: nonce,
      });

      screeningId = screenResult.screeningId ?? null;

      if (!screenResult.approved) {
        screeningStatus = screenResult.riskScore >= config.chainalysis.autoRejectThreshold
          ? "blocked"
          : "flagged";

        await logAuditEvent({
          institutionId,
          eventType: "transfer.blocked",
          entityType: "transfer",
          actor,
          details: {
            nonce,
            senderWallet: input.senderWallet,
            receiverWallet: input.receiverWallet,
            amount: input.amount,
            riskScore: screenResult.riskScore,
            rating: screenResult.rating,
            exposures: screenResult.exposures,
          },
        });

        // Reject immediately for high risk / severe
        throw Object.assign(
          new Error(
            `Transfer blocked by compliance screening: ${screenResult.rating} ` +
            `(score ${screenResult.riskScore}/100)`
          ),
          { statusCode: 403, rating: screenResult.rating, riskScore: screenResult.riskScore }
        );
      }

      screeningStatus = "cleared";
    } catch (err) {
      // Re-throw if it's our intentional rejection
      if ((err as { statusCode?: number }).statusCode === 403) {
        throw err;
      }
      // Screening provider failure — log and proceed with "pending" status
      // We don't want Chainalysis downtime to halt all transfers
      console.error("Chainalysis screening failed, proceeding with pending status:", err);
      screeningStatus = "pending";
    }
  }

  // Create the transfer record
  const [transfer] = await db
    .insert(transfers)
    .values({
      nonce,
      institutionId,
      senderWallet: input.senderWallet,
      receiverWallet: input.receiverWallet,
      mint: input.mint,
      amount: BigInt(input.amount),
      status: 0, // pending
      travelRuleId,
      screeningStatus,
      screeningId,
    })
    .returning();

  await logAuditEvent({
    institutionId,
    eventType: "transfer.submitted",
    entityType: "transfer",
    entityId: transfer.id,
    actor,
    details: {
      nonce,
      senderWallet: input.senderWallet,
      receiverWallet: input.receiverWallet,
      amount: input.amount,
      screeningStatus,
    },
  });

  // ─── Build and submit the on-chain transaction ──────────────
  try {
    const programId = new PublicKey(config.solana.programId);
    const connection = new Connection(config.solana.rpcUrl, "confirmed");

    // Load authority keypair
    const walletPath = config.solana.walletPath.replace("~", process.env.HOME || "");
    const keyData = JSON.parse(readFileSync(walletPath, "utf-8")) as number[];
    const authorityKeypair = Keypair.fromSecretKey(Uint8Array.from(keyData));
    const wallet = new Wallet(authorityKeypair);

    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

    // Load the program with the real IDL from the SDK
    const program = new Program(
      payclearIdl as any,
      provider
    );

    // Derive PDAs
    const nonceBuffer = Buffer.from(nonce, "hex");

    const REGISTRY_SEED = Buffer.from("registry");
    const INSTITUTION_SEED = Buffer.from("institution");
    const KYC_SEED = Buffer.from("kyc");
    const POLICY_SEED = Buffer.from("policy");
    const TRANSFER_SEED = Buffer.from("transfer");

    // Look up institution on-chain pubkey and institution_id
    const [inst] = await db
      .select()
      .from(institutions)
      .where(eq(institutions.id, institutionId));

    const institutionIdBytes = Buffer.from(inst.institutionId, "hex");

    const [registryPda] = PublicKey.findProgramAddressSync(
      [REGISTRY_SEED],
      programId
    );
    const [institutionPda] = PublicKey.findProgramAddressSync(
      [INSTITUTION_SEED, institutionIdBytes],
      programId
    );

    const senderPubkey = new PublicKey(input.senderWallet);
    const receiverPubkey = new PublicKey(input.receiverWallet);

    const [senderAttestationPda] = PublicKey.findProgramAddressSync(
      [KYC_SEED, institutionPda.toBuffer(), senderPubkey.toBuffer()],
      programId
    );
    const [receiverAttestationPda] = PublicKey.findProgramAddressSync(
      [KYC_SEED, institutionPda.toBuffer(), receiverPubkey.toBuffer()],
      programId
    );

    const policyIdBuffer = Buffer.from(input.policyId, "hex");
    const [policyPda] = PublicKey.findProgramAddressSync(
      [POLICY_SEED, institutionPda.toBuffer(), policyIdBuffer],
      programId
    );
    const [transferRecordPda] = PublicKey.findProgramAddressSync(
      [TRANSFER_SEED, nonceBuffer],
      programId
    );

    const mintPubkey = new PublicKey(input.mint);

    const accounts: Record<string, PublicKey> = {
      sender: authorityKeypair.publicKey,
      senderTokenAccount: senderPubkey,
      receiverTokenAccount: receiverPubkey,
      mint: mintPubkey,
      senderAttestation: senderAttestationPda,
      receiverAttestation: receiverAttestationPda,
      receiverWallet: receiverPubkey,
      compliancePolicy: policyPda,
      transferRecord: transferRecordPda,
      registry: registryPda,
      tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      systemProgram: PublicKey.default,
    };

    const txSignature = await (program.methods as any)
      .executeCompliantTransfer(
        Array.from(nonceBuffer),
        new BN(input.amount)
      )
      .accounts(accounts)
      .rpc();

    // Update transfer record with success
    await db
      .update(transfers)
      .set({
        txSignature,
        status: 1, // completed
        confirmedAt: new Date(),
      })
      .where(eq(transfers.id, transfer.id));

    await logAuditEvent({
      institutionId,
      eventType: "transfer.confirmed",
      entityType: "transfer",
      entityId: transfer.id,
      actor,
      details: {
        nonce,
        txSignature,
        amount: input.amount,
        senderWallet: input.senderWallet,
        receiverWallet: input.receiverWallet,
      },
    });

    return { ...transfer, txSignature, status: 1, confirmedAt: new Date() };
  } catch (txError) {
    const errorMessage = txError instanceof Error ? txError.message : String(txError);

    // Mark transfer as failed but do not crash the API
    await db
      .update(transfers)
      .set({
        status: 2, // failed
        errorMessage,
      })
      .where(eq(transfers.id, transfer.id));

    await logAuditEvent({
      institutionId,
      eventType: "transfer.failed",
      entityType: "transfer",
      entityId: transfer.id,
      actor,
      details: {
        nonce,
        error: errorMessage,
        senderWallet: input.senderWallet,
        receiverWallet: input.receiverWallet,
        amount: input.amount,
      },
    });

    console.error("On-chain transfer submission failed:", errorMessage);

    return { ...transfer, status: 2, errorMessage };
  }
}

export async function getTransfer(nonce: string) {
  const [transfer] = await db
    .select()
    .from(transfers)
    .where(eq(transfers.nonce, nonce));
  return transfer ?? null;
}

export async function listTransfers(institutionId: string, limit = 50, offset = 0) {
  return db
    .select()
    .from(transfers)
    .where(eq(transfers.institutionId, institutionId))
    .orderBy(transfers.createdAt)
    .limit(limit)
    .offset(offset);
}
