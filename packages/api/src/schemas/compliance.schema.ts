import { z } from "zod";

export const kycVerifySchema = z.object({
  wallet: z.string().min(32).max(44),
  fullName: z.string().min(1).max(200),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nationality: z.string().length(2),
});

export const kytScoreSchema = z.object({
  senderWallet: z.string().min(32).max(44),
  receiverWallet: z.string().min(32).max(44),
  amount: z.number().positive(),
  currency: z.string().default("USDC"),
});

export const travelRulePackageSchema = z.object({
  originator: z.object({
    name: z.string().min(1),
    wallet: z.string().min(32).max(44),
    institution: z.string().optional(),
  }),
  beneficiary: z.object({
    name: z.string().min(1),
    wallet: z.string().min(32).max(44),
    institution: z.string().optional(),
  }),
  amount: z.number().positive(),
  currency: z.string().default("USDC"),
});

export const oracleAttestSchema = z.object({
  transferNonce: z.string().min(1),
});

export type KycVerifyInput = z.infer<typeof kycVerifySchema>;
export type KytScoreInput = z.infer<typeof kytScoreSchema>;
export type TravelRulePackageInput = z.infer<typeof travelRulePackageSchema>;
export type OracleAttestInput = z.infer<typeof oracleAttestSchema>;
