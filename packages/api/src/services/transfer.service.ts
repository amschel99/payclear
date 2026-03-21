import { eq } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { db } from "../db/client.js";
import { transfers, travelRuleData } from "../db/schema.js";
import { logAuditEvent } from "./audit.service.js";
import { config } from "../config.js";
import * as riskService from "./chainalysis/risk.service.js";
import type { SubmitTransferInput } from "../schemas/transfer.schema.js";

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

  // TODO: Build and submit the on-chain transaction via solana.service
  // For now, return the pending transfer record

  return transfer;
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
