import { z } from "zod";

export const createPolicySchema = z.object({
  name: z.string().min(1).max(256),
  minKycLevel: z.number().int().min(0).max(3).default(1),
  maxRiskScore: z.number().int().min(0).max(100).default(70),
  travelRuleThreshold: z.string().default("1000000000"), // BigInt as string
  requireBothAttested: z.boolean().default(true),
  maxTransferAmount: z.string().default("0"),
  dailyLimit: z.string().default("0"),
  allowedJurisdictions: z.array(z.string().length(2)).optional(),
  blockedJurisdictions: z.array(z.string().length(2)).optional(),
});

export const updatePolicySchema = createPolicySchema.partial();

export type CreatePolicyInput = z.infer<typeof createPolicySchema>;
export type UpdatePolicyInput = z.infer<typeof updatePolicySchema>;
