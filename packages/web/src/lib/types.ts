export interface KycVerifyRequest {
  wallet: string;
  fullName: string;
  dateOfBirth: string;
  nationality: string;
}

export interface KycVerifyResponse {
  verified: boolean;
  kycLevel: number;
  expiresAt: string;
}

export interface KytScoreRequest {
  senderWallet: string;
  receiverWallet: string;
  amount: number;
  currency: string;
}

export interface KytScoreResponse {
  score: number;
  passed: boolean;
  factors: string[];
}

export interface TravelRuleParty {
  name: string;
  wallet: string;
  institution: string;
}

export interface TravelRuleRequest {
  originator: TravelRuleParty;
  beneficiary: TravelRuleParty;
  amount: number;
  currency: string;
}

export interface TravelRuleResponse {
  hash: string;
  transferNonce: string;
}

export interface OracleAttestRequest {
  transferNonce: string;
}

export interface OracleAttestResponse {
  txSignature: string;
  status: string;
  attestedAt: string;
}

export interface Transfer {
  id: string;
  date: string;
  senderWallet: string;
  senderName: string;
  receiverWallet: string;
  receiverName: string;
  amount: number;
  currency: string;
  kytScore: number;
  kytPassed: boolean;
  travelRuleHash: string;
  travelRuleStatus: "pending" | "packaged" | "verified";
  settlementStatus: "pending" | "cleared" | "settled" | "rejected";
  txSignature?: string;
  transferNonce: string;
}

export type ComplianceStepStatus = "pending" | "running" | "passed" | "failed";

export interface ComplianceStep {
  id: string;
  label: string;
  description: string;
  status: ComplianceStepStatus;
  detail?: string;
}
