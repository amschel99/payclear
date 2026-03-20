import { z } from "zod";

export const submitTransferSchema = z.object({
  senderWallet: z.string().min(32).max(44),
  receiverWallet: z.string().min(32).max(44),
  mint: z.string().min(32).max(44),
  amount: z.string(), // BigInt as string
  policyId: z.string(), // hex-encoded policy ID
  // Travel Rule data (required if above threshold)
  travelRule: z
    .object({
      beneficiaryInstitutionId: z.string().uuid(),
      originatorName: z.string(),
      originatorAccount: z.string(),
      originatorAddressStreet: z.string().optional(),
      originatorAddressCity: z.string().optional(),
      originatorAddressCountry: z.string().length(2).optional(),
      originatorNationalId: z.string().optional(),
      originatorDob: z.string().optional(),
      originatorPlaceOfBirth: z.string().optional(),
      beneficiaryName: z.string(),
      beneficiaryAccount: z.string(),
      beneficiaryAddressStreet: z.string().optional(),
      beneficiaryAddressCity: z.string().optional(),
      beneficiaryAddressCountry: z.string().length(2).optional(),
      beneficiaryInstitutionName: z.string().optional(),
    })
    .optional(),
});

export type SubmitTransferInput = z.infer<typeof submitTransferSchema>;
