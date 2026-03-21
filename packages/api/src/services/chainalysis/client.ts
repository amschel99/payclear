/**
 * Chainalysis KYT v2 API Client
 *
 * Production-grade client with retry logic, rate-limit awareness,
 * and proper error propagation. Built from operational experience
 * handling 100B+ daily USDT volume at Tether.
 */

// ─── Types ───────────────────────────────────────────────────

export interface RegisterTransferParams {
  userId: string;
  asset: string;
  transferReference: string;
  direction: "sent" | "received";
  outputAddress: string;
  amount: number;
  timestamp: string;
  network: string;
}

export interface TransferRegistration {
  externalId: string;
  asset: string;
  network: string;
  transferReference: string;
  createdAt: string;
}

export interface Exposure {
  category: string;
  categoryId: number;
  value: number;
  rating: string;
}

export interface TransferRiskAssessment {
  updatedAt: string;
  asset: string;
  network: string;
  transferReference: string;
  rating: "lowRisk" | "mediumRisk" | "highRisk" | "severe";
  riskScore: number;
  cluster: {
    name: string;
    category: string;
  } | null;
  exposures: Exposure[];
}

export interface WalletRegistration {
  address: string;
  network: string;
  userId: string;
  createdAt: string;
}

export interface AlertQueryParams {
  alertStatus?: "flagged" | "dismissed" | "resolved";
  userId?: string;
  createdAtGte?: string;
  createdAtLte?: string;
  limit?: number;
  offset?: number;
}

export interface Alert {
  alertId: string;
  externalId: string;
  alertType: string;
  category: string;
  level: string;
  service: string;
  exposureType: string;
  alertAmount: number;
  alertStatus: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  transferReference: string;
  direction: string;
  asset: string;
  network: string;
}

export interface ChainalysisError {
  status: number;
  message: string;
  retryable: boolean;
}

// ─── Client ──────────────────────────────────────────────────

export class ChainalysisClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  // Rate limit tracking from response headers
  private rateLimitRemaining = Infinity;
  private rateLimitResetAt = 0;

  constructor(
    apiKey: string,
    baseUrl = "https://api.chainalysis.com/api/kyt/v2",
    options?: { timeoutMs?: number; maxRetries?: number }
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeoutMs = options?.timeoutMs ?? 10_000;
    this.maxRetries = options?.maxRetries ?? 3;
  }

  // ─── Public API ──────────────────────────────────────────

  async registerTransfer(
    params: RegisterTransferParams
  ): Promise<TransferRegistration> {
    return this.request<TransferRegistration>(
      "POST",
      `/users/${encodeURIComponent(params.userId)}/transfers`,
      {
        asset: params.asset,
        transferReference: params.transferReference,
        direction: params.direction,
        outputAddress: params.outputAddress,
        transferTimestamp: params.timestamp,
        assetAmount: params.amount,
        network: params.network,
      }
    );
  }

  async getTransferRiskAssessment(
    externalId: string
  ): Promise<TransferRiskAssessment> {
    return this.request<TransferRiskAssessment>(
      "GET",
      `/transfers/${encodeURIComponent(externalId)}`
    );
  }

  async registerWalletAddress(
    userId: string,
    address: string,
    network: string
  ): Promise<WalletRegistration> {
    return this.request<WalletRegistration>(
      "POST",
      `/users/${encodeURIComponent(userId)}/withdrawaladdresses`,
      {
        network,
        address,
      }
    );
  }

  async getAlerts(params: AlertQueryParams = {}): Promise<Alert[]> {
    const query = new URLSearchParams();
    if (params.alertStatus) query.set("alertStatus", params.alertStatus);
    if (params.userId) query.set("userId", params.userId);
    if (params.createdAtGte) query.set("createdAt_gte", params.createdAtGte);
    if (params.createdAtLte) query.set("createdAt_lte", params.createdAtLte);
    if (params.limit) query.set("limit", String(params.limit));
    if (params.offset) query.set("offset", String(params.offset));

    const qs = query.toString();
    return this.request<Alert[]>("GET", `/alerts${qs ? `?${qs}` : ""}`);
  }

  // ─── Internal Request Machinery ──────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    let lastError: ChainalysisError | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        // Exponential backoff: 1s, 2s, 4s
        const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        const jitter = Math.random() * 500;
        await this.sleep(backoff + jitter);
      }

      // Rate limit awareness — if we know we're near the limit, back off proactively
      if (this.rateLimitRemaining <= 2 && Date.now() < this.rateLimitResetAt) {
        const waitMs = this.rateLimitResetAt - Date.now() + 100;
        await this.sleep(Math.min(waitMs, 30_000));
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        const headers: Record<string, string> = {
          Token: this.apiKey,
          Accept: "application/json",
        };
        if (body) {
          headers["Content-Type"] = "application/json";
        }

        const response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timer);

        // Track rate limit headers
        this.updateRateLimits(response);

        if (response.ok) {
          return (await response.json()) as T;
        }

        const errorBody = await response.text().catch(() => "Unknown error");
        const err: ChainalysisError = {
          status: response.status,
          message: `Chainalysis API error ${response.status}: ${errorBody}`,
          retryable: response.status >= 500 || response.status === 429,
        };

        if (!err.retryable) {
          throw err;
        }

        // If rate limited, wait for the reset window
        if (response.status === 429) {
          const retryAfter = response.headers.get("retry-after");
          if (retryAfter) {
            await this.sleep(parseInt(retryAfter, 10) * 1000);
          }
        }

        lastError = err;
      } catch (error) {
        if ((error as ChainalysisError).retryable === false) {
          throw error;
        }

        // Network/timeout errors are retryable
        lastError = {
          status: 0,
          message:
            error instanceof Error
              ? error.message
              : "Unknown network error",
          retryable: true,
        };
      }
    }

    throw lastError ?? {
      status: 0,
      message: "Max retries exceeded",
      retryable: false,
    };
  }

  private updateRateLimits(response: Response): void {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = response.headers.get("x-ratelimit-reset");

    if (remaining !== null) {
      this.rateLimitRemaining = parseInt(remaining, 10);
    }
    if (reset !== null) {
      this.rateLimitResetAt = parseInt(reset, 10) * 1000;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
