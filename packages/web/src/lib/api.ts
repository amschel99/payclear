import axios, { AxiosError } from "axios";
import type {
  ApiTransfer,
  ApiAuditEvent,
  KycVerifyRequest,
  KycVerifyResponse,
  KytScoreRequest,
  KytScoreResponse,
  TravelRuleRequest,
  TravelRuleResponse,
  OracleAttestRequest,
  OracleAttestResponse,
} from "./types";

/** Returns the institutional API key from env or sessionStorage (set by the in-app key banner). */
export function getApiKey(): string | null {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_KEY) {
    return process.env.NEXT_PUBLIC_API_KEY;
  }
  if (typeof window !== "undefined") {
    return window.sessionStorage.getItem("payclear_api_key");
  }
  return null;
}

/** Saves an API key to sessionStorage (survives page refresh within the same tab session). */
export function saveApiKey(key: string): void {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem("payclear_api_key", key);
  }
}

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

export async function listAuditEvents(
  limit = 50,
  offset = 0
): Promise<ApiAuditEvent[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new ApiError("No API key configured", 401);
  try {
    const response = await client.get<ApiAuditEvent[]>("/v1/audit/transfers", {
      params: { limit, offset },
      headers: { "X-API-Key": apiKey },
    });
    return response.data;
  } catch (error) {
    handleError(error);
  }
}

export async function listTransfers(
  limit = 50,
  offset = 0
): Promise<ApiTransfer[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new ApiError("No API key configured", 401);
  }
  try {
    const response = await client.get<ApiTransfer[]>("/v1/transfers", {
      params: { limit, offset },
      headers: { "X-API-Key": apiKey },
    });
    return response.data;
  } catch (error) {
    handleError(error);
  }
}
