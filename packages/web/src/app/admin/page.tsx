"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  AlertTriangle,
  Clock,
  KeyRound,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { attestOracle, listTransfers, getApiKey, saveApiKey } from "@/lib/api";
import { explorerUrl } from "@/lib/constants";
import type { ApiTransfer } from "@/lib/types";

interface PendingTransfer {
  id: string;
  date: string;
  senderWallet: string;
  receiverWallet: string;
  amount: number;
  currency: string;
  kytScore: number;
  kytPassed: boolean;
  travelRuleHash: string;
  transferNonce: string;
  attestationStatus: "pending" | "attesting" | "attested" | "failed";
  txSignature?: string;
  attestedAt?: string;
  error?: string;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function mapApiToPending(t: ApiTransfer): PendingTransfer {
  return {
    id: t.id,
    date: t.createdAt,
    senderWallet: t.senderWallet,
    receiverWallet: t.receiverWallet,
    amount: Number(t.amount) / 1_000_000,
    currency: "USDC",
    kytScore: t.senderRiskScore ?? 0,
    kytPassed: (t.senderRiskScore ?? 0) < 70 && t.screeningStatus !== "blocked" && t.screeningStatus !== "flagged",
    travelRuleHash: t.travelRuleId ?? "",
    transferNonce: t.nonce,
    attestationStatus: "pending",
  };
}

export default function AdminPage() {
  const [transfers, setTransfers] = useState<PendingTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [hasKey, setHasKey] = useState(false);

  const fetchTransfers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await listTransfers(50, 0);
      const pending = all
        .filter((t) => t.status === 0)
        .map(mapApiToPending);
      setTransfers(pending);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load transfers";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setHasKey(!!getApiKey());
  }, []);

  useEffect(() => {
    if (hasKey) fetchTransfers();
  }, [hasKey, fetchTransfers]);

  const handleSaveKey = () => {
    if (!apiKeyInput.trim()) return;
    saveApiKey(apiKeyInput.trim());
    setHasKey(true);
    setApiKeyInput("");
  };

  const handleAttest = async (id: string) => {
    setTransfers((prev: PendingTransfer[]) =>
      prev.map((t: PendingTransfer) =>
        t.id === id ? { ...t, attestationStatus: "attesting" as const, error: undefined } : t
      )
    );

    const transfer = transfers.find((t: PendingTransfer) => t.id === id);
    if (!transfer) return;

    try {
      const result = await attestOracle({ transferNonce: transfer.transferNonce });
      setTransfers((prev: PendingTransfer[]) =>
        prev.map((t: PendingTransfer) =>
          t.id === id
            ? { ...t, attestationStatus: "attested" as const, txSignature: result.txSignature, attestedAt: result.attestedAt }
            : t
        )
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Attestation failed";
      setTransfers((prev: PendingTransfer[]) =>
        prev.map((t: PendingTransfer) =>
          t.id === id ? { ...t, attestationStatus: "failed" as const, error: message } : t
        )
      );
    }
  };

  const pendingCount = transfers.filter((t: PendingTransfer) => t.attestationStatus === "pending").length;
  const attestedCount = transfers.filter((t: PendingTransfer) => t.attestationStatus === "attested").length;

  return (
    <div className="min-h-[calc(100vh-64px)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 animate-slide-up">
          <div>
            <h1 className="text-2xl font-bold text-white">Oracle Admin</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Review and attest compliant transfers on-chain
            </p>
          </div>
          <div className="flex items-center gap-3">
            {hasKey && (
              <button
                onClick={fetchTransfers}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300 disabled:opacity-50 transition-all duration-200"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-amber-400">{pendingCount} Pending</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">{attestedCount} Attested</span>
            </div>
          </div>
        </div>

        {/* API key banner */}
        {!hasKey && (
          <div className="mb-8 p-5 rounded-xl border border-amber-500/20 bg-amber-500/5 flex flex-col sm:flex-row sm:items-center gap-4 animate-slide-up stagger-1">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-300">API key required</p>
              <p className="text-xs text-amber-400/70 mt-0.5">
                Enter your institutional API key to load pending transfers, or set{" "}
                <code className="font-mono bg-amber-500/10 px-1 rounded">NEXT_PUBLIC_API_KEY</code>{" "}
                in <code className="font-mono bg-amber-500/10 px-1 rounded">.env.local</code>
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <input
                type="password"
                className="input text-sm w-52"
                placeholder="Paste API key…"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveKey()}
              />
              <button onClick={handleSaveKey} className="btn-primary shrink-0">
                Connect
              </button>
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mb-8 p-4 rounded-xl border border-red-500/20 bg-red-500/5 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20 gap-3 text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading pending transfers…</span>
          </div>
        )}

        {/* Empty */}
        {!loading && hasKey && transfers.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-zinc-600" />
            </div>
            <p className="text-sm font-medium text-zinc-400">No pending transfers</p>
            <p className="text-xs mt-1 text-zinc-600">All transfers have been attested or none have been submitted yet.</p>
          </div>
        )}

        {/* No key */}
        {!loading && !hasKey && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
              <KeyRound className="w-6 h-6 text-zinc-600" />
            </div>
            <p className="text-sm font-medium text-zinc-400">Connect an API key to see pending transfers</p>
          </div>
        )}

        {/* Transfer cards */}
        {!loading && transfers.length > 0 && (
          <div className="space-y-4">
            {transfers.map((tx: PendingTransfer, i: number) => (
              <div
                key={tx.id}
                className={`card transition-all duration-300 animate-slide-up ${
                  tx.attestationStatus === "attested"
                    ? "border-emerald-500/20"
                    : tx.attestationStatus === "failed"
                    ? "border-red-500/20"
                    : !tx.kytPassed
                    ? "border-amber-500/20"
                    : ""
                }`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-5">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    <div>
                      <p className="text-xs text-zinc-500 font-medium mb-1.5">Transfer</p>
                      <p className="text-xs font-mono text-zinc-300">
                        {shortAddr(tx.senderWallet)}
                      </p>
                      <p className="text-xs text-zinc-600 my-0.5">↓</p>
                      <p className="text-xs font-mono text-zinc-300">
                        {shortAddr(tx.receiverWallet)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-zinc-500 font-medium mb-1.5">Amount</p>
                      <p className="text-sm font-bold text-white">
                        ${tx.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}{" "}
                        <span className="text-xs font-medium text-zinc-600">{tx.currency}</span>
                      </p>
                      <p className="text-xs text-zinc-600 mt-0.5">
                        {new Date(tx.date).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-zinc-500 font-medium mb-1.5">KYT Score</p>
                      <div className="flex items-center gap-2">
                        <span
                          className={`badge ${
                            !tx.kytPassed
                              ? "bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/20"
                              : tx.kytScore <= 20
                              ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20"
                              : "bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20"
                          }`}
                        >
                          {tx.kytScore}/100
                        </span>
                        {!tx.kytPassed && (
                          <span className="flex items-center gap-1 text-xs text-red-400 font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            High Risk
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-zinc-500 font-medium mb-1.5">Travel Rule</p>
                      {tx.travelRuleHash ? (
                        <p className="text-xs font-mono text-zinc-400 break-all">
                          {tx.travelRuleHash.slice(0, 24)}…
                        </p>
                      ) : (
                        <span className="badge badge-pending text-xs">Not required</span>
                      )}
                    </div>
                  </div>

                  <div className="flex-shrink-0 flex items-center gap-3 lg:pl-5 lg:border-l lg:border-white/[0.06]">
                    {tx.attestationStatus === "pending" && (
                      <button
                        onClick={() => handleAttest(tx.id)}
                        disabled={!tx.kytPassed}
                        className={`btn-primary min-w-[120px] ${!tx.kytPassed ? "opacity-40 cursor-not-allowed" : ""}`}
                        title={!tx.kytPassed ? "Cannot attest: KYT check failed" : "Attest this transfer on-chain"}
                      >
                        <ShieldCheck className="w-4 h-4" />
                        Attest
                      </button>
                    )}
                    {tx.attestationStatus === "attesting" && (
                      <div className="flex items-center gap-2 min-w-[120px] justify-center px-4 py-2.5 rounded-lg bg-primary-500/10 text-primary-400 text-sm font-medium border border-primary-500/20">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Attesting...
                      </div>
                    )}
                    {tx.attestationStatus === "attested" && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" />
                          Attested
                        </div>
                        {tx.txSignature && (
                          <a
                            href={explorerUrl(tx.txSignature)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors"
                          >
                            Explorer
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    )}
                    {tx.attestationStatus === "failed" && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-red-400">
                          <XCircle className="w-4 h-4" />
                          Failed
                        </div>
                        {tx.error && (
                          <p className="text-xs text-red-400/70 max-w-[200px]">{tx.error}</p>
                        )}
                        <button
                          onClick={() => handleAttest(tx.id)}
                          className="text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
