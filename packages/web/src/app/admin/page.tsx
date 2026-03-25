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
  Stamp,
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
    // USDC has 6 decimal places
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
      // Show only pending (status=0) transfers in the admin queue
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
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
              <Stamp className="w-6 h-6 text-primary-600" />
              Oracle Admin
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Review and attest compliant transfers on-chain
            </p>
          </div>
          <div className="flex items-center gap-3">
            {hasKey && (
              <button
                onClick={fetchTransfers}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-100">
              <Clock className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-700">{pendingCount} Pending</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">{attestedCount} Attested</span>
            </div>
          </div>
        </div>

        {/* API key banner */}
        {!hasKey && (
          <div className="mb-6 p-4 rounded-xl border border-amber-200 bg-amber-50 flex flex-col sm:flex-row sm:items-center gap-3">
            <KeyRound className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">API key required</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Enter your institutional API key to load pending transfers, or set{" "}
                <code className="font-mono bg-amber-100 px-1 rounded">NEXT_PUBLIC_API_KEY</code>{" "}
                in <code className="font-mono bg-amber-100 px-1 rounded">.env.local</code>.
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
          <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading pending transfers…</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && hasKey && transfers.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <CheckCircle2 className="w-8 h-8 mb-3" />
            <p className="text-sm font-medium">No pending transfers</p>
            <p className="text-xs mt-1">All transfers have been attested or none have been submitted yet.</p>
          </div>
        )}

        {/* No key state */}
        {!loading && !hasKey && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <KeyRound className="w-8 h-8 mb-3" />
            <p className="text-sm font-medium">Connect an API key to see pending transfers</p>
          </div>
        )}

        {/* Transfer cards */}
        {!loading && transfers.length > 0 && (
          <div className="space-y-4">
            {transfers.map((tx: PendingTransfer) => (
              <div
                key={tx.id}
                className={`card transition-all duration-300 ${
                  tx.attestationStatus === "attested"
                    ? "border-emerald-200 bg-emerald-50/20"
                    : tx.attestationStatus === "failed"
                    ? "border-red-200 bg-red-50/20"
                    : !tx.kytPassed
                    ? "border-amber-200 bg-amber-50/10"
                    : ""
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Parties */}
                    <div>
                      <p className="text-xs text-gray-500 font-medium mb-1">Transfer</p>
                      <p className="text-xs font-mono text-gray-700">
                        {shortAddr(tx.senderWallet)}
                      </p>
                      <p className="text-xs text-gray-400">↓</p>
                      <p className="text-xs font-mono text-gray-700">
                        {shortAddr(tx.receiverWallet)}
                      </p>
                    </div>

                    {/* Amount */}
                    <div>
                      <p className="text-xs text-gray-500 font-medium mb-1">Amount</p>
                      <p className="text-sm font-bold text-gray-900">
                        ${tx.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}{" "}
                        <span className="text-xs font-medium text-gray-400">{tx.currency}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(tx.date).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>

                    {/* KYT */}
                    <div>
                      <p className="text-xs text-gray-500 font-medium mb-1">KYT Score</p>
                      <div className="flex items-center gap-2">
                        <span
                          className={`badge ${
                            !tx.kytPassed
                              ? "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20"
                              : tx.kytScore <= 20
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
                              : "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20"
                          }`}
                        >
                          {tx.kytScore}/100
                        </span>
                        {!tx.kytPassed && (
                          <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            High Risk
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Travel Rule */}
                    <div>
                      <p className="text-xs text-gray-500 font-medium mb-1">Travel Rule</p>
                      {tx.travelRuleHash ? (
                        <p className="text-xs font-mono text-gray-600 break-all">
                          {tx.travelRuleHash.slice(0, 24)}…
                        </p>
                      ) : (
                        <span className="badge badge-pending text-xs">Not required</span>
                      )}
                    </div>
                  </div>

                  {/* Action */}
                  <div className="flex-shrink-0 flex items-center gap-3 lg:pl-4 lg:border-l lg:border-gray-100">
                    {tx.attestationStatus === "pending" && (
                      <button
                        onClick={() => handleAttest(tx.id)}
                        disabled={!tx.kytPassed}
                        className={`btn-primary min-w-[120px] ${!tx.kytPassed ? "opacity-50 cursor-not-allowed" : ""}`}
                        title={!tx.kytPassed ? "Cannot attest: KYT check failed" : "Attest this transfer on-chain"}
                      >
                        <ShieldCheck className="w-4 h-4" />
                        Attest
                      </button>
                    )}
                    {tx.attestationStatus === "attesting" && (
                      <div className="flex items-center gap-2 min-w-[120px] justify-center px-4 py-2.5 rounded-lg bg-primary-50 text-primary-700 text-sm font-medium">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Attesting...
                      </div>
                    )}
                    {tx.attestationStatus === "attested" && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                          <CheckCircle2 className="w-4 h-4" />
                          Attested
                        </div>
                        {tx.txSignature && (
                          <a
                            href={explorerUrl(tx.txSignature)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
                          >
                            Explorer
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    )}
                    {tx.attestationStatus === "failed" && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-red-600">
                          <XCircle className="w-4 h-4" />
                          Failed
                        </div>
                        {tx.error && (
                          <p className="text-xs text-red-500 max-w-[200px]">{tx.error}</p>
                        )}
                        <button
                          onClick={() => handleAttest(tx.id)}
                          className="text-xs text-primary-600 hover:text-primary-700 font-medium"
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
