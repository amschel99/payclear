import { z } from "zod";

export const addTrustedInstitutionSchema = z.object({
  trustedInstitutionId: z.string().uuid(),
  minKycLevel: z.number().int().min(0).max(3).default(1),
  requireSameJurisdiction: z.boolean().default(false),
});

export const acceptExternalAttestationSchema = z.object({
  externalInstitutionId: z.string().uuid(),
});

export type AddTrustedInstitutionInput = z.infer<typeof addTrustedInstitutionSchema>;
export type AcceptExternalAttestationInput = z.infer<typeof acceptExternalAttestationSchema>;
