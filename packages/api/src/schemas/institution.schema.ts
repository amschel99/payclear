import { z } from "zod";

export const createInstitutionSchema = z.object({
  name: z.string().min(1).max(256),
  vaspCode: z.string().min(1).max(32),
  jurisdiction: z.string().length(2),
  authorityPubkey: z.string().min(32).max(44), // Base58 Solana pubkey
});

export const updateInstitutionSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  active: z.boolean().optional(),
});

export type CreateInstitutionInput = z.infer<typeof createInstitutionSchema>;
export type UpdateInstitutionInput = z.infer<typeof updateInstitutionSchema>;
