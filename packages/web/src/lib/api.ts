import axios, { AxiosError } from "axios";
import type {
  KycVerifyRequest,
  KycVerifyResponse,
  KytScoreRequest,
  KytScoreResponse,
  TravelRuleRequest,
  TravelRuleResponse,
  OracleAttestRequest,
  OracleAttestResponse,
} from "./types";

const client = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function handleError(error: unknown): never {
  if (error instanceof AxiosError) {
    const message =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message;
    throw new ApiError(message, error.response?.status || 500);
  }
  throw error;
}

export async function verifyKyc(
  data: KycVerifyRequest
): Promise<KycVerifyResponse> {
  try {
    const response = await client.post<KycVerifyResponse>(
      "/api/kyc/verify",
      data
    );
    return response.data;
  } catch (error) {
    handleError(error);
  }
}

export async function scoreKyt(
  data: KytScoreRequest
): Promise<KytScoreResponse> {
  try {
    const response = await client.post<KytScoreResponse>(
      "/api/kyt/score",
      data
    );
    return response.data;
  } catch (error) {
    handleError(error);
  }
}

export async function packageTravelRule(
  data: TravelRuleRequest
): Promise<TravelRuleResponse> {
  try {
    const response = await client.post<TravelRuleResponse>(
      "/api/travel-rule/package",
      data
    );
    return response.data;
  } catch (error) {
    handleError(error);
  }
}

export async function attestOracle(
  data: OracleAttestRequest
): Promise<OracleAttestResponse> {
  try {
    const response = await client.post<OracleAttestResponse>(
      "/api/oracle/attest",
      data
    );
    return response.data;
  } catch (error) {
    handleError(error);
  }
}

export async function checkHealth(): Promise<{
  status: string;
  timestamp: string;
}> {
  try {
    const response = await client.get("/health");
    return response.data;
  } catch (error) {
    handleError(error);
  }
}
