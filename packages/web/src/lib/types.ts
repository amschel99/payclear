export interface KycVerifyRequest {
  wallet: string;
  fullName: string;
  dateOfBirth: string;
  nationality: string;
}

export interface KycVerifyResponse {
  verified: boolean;
  status: "verified" | "pending" | "rejected";
  kycLevel: number;
  expiresAt: string;
  applicantId: string;
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

// Shape returned by GET /v1/transfers
export interface ApiTransfer {
  id: string;
  nonce: string;
  institutionId: string;
  senderWallet: string;
  receiverWallet: string;
  mint: string;
  amount: string; // BigInt serialised as string; USDC = divide by 1_000_000
  status: number; // 0=pending, 1=completed, 2=failed
  txSignature: string | null;
  compliancePolicyId: string | null;
  senderRiskScore: number | null;
  receiverRiskScore: number | null;
  travelRuleId: string | null;
  screeningStatus: string | null; // 'pending'|'cleared'|'flagged'|'blocked'
  screeningId: string | null;
  errorMessage: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

// Shape returned by GET /v1/audit/transfers
export interface ApiAuditEvent {
  id: string;
  institutionId: string | null;
  eventType: string;
  entityType: string;
  entityId: string | null;
  actor: string;
  details: Record<string, unknown> | null;
  txSignature: string | null;
  createdAt: string;
}

export type ComplianceStepStatus = "pending" | "running" | "passed" | "failed";

export interface ComplianceStep {
  id: string;
  label: string;
  description: string;
  status: ComplianceStepStatus;
  detail?: string;
}
