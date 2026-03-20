import { z } from "zod";

export const createEntitySchema = z.object({
  walletAddress: z.string().min(32).max(44),
  kycLevel: z.number().int().min(0).max(3),
  riskScore: z.number().int().min(0).max(100),
  expiresAt: z.string().datetime().optional(),
  // KYC data
  fullName: z.string().optional(),
  dateOfBirth: z.string().optional(),
  nationality: z.string().length(2).optional(),
  governmentIdType: z.string().optional(),
  governmentIdHash: z.string().optional(),
  addressLine1: z.string().optional(),
  addressCity: z.string().optional(),
  addressCountry: z.string().length(2).optional(),
});

export const updateEntitySchema = z.object({
  kycLevel: z.number().int().min(0).max(3).optional(),
  riskScore: z.number().int().min(0).max(100).optional(),
  status: z.number().int().min(0).max(3).optional(),
});

export type CreateEntityInput = z.infer<typeof createEntitySchema>;
export type UpdateEntityInput = z.infer<typeof updateEntitySchema>;
