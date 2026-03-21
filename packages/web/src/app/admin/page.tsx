"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  AlertTriangle,
  Clock,
  Stamp,
} from "lucide-react";
import { attestOracle } from "@/lib/api";
import { explorerUrl } from "@/lib/constants";

interface PendingTransfer {
  id: string;
  date: string;
  senderName: string;
  senderWallet: string;
  receiverName: string;
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

const INITIAL_TRANSFERS: PendingTransfer[] = [
  {
    id: "ptx_001",
    date: "2026-03-21T14:55:00Z",
    senderName: "Alice Johnson",
    senderWallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    receiverName: "Bob Williams",
    receiverWallet: "DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy",
    amount: 42000,
    currency: "USDC",
    kytScore: 15,
    kytPassed: true,
    travelRuleHash: "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4",
    transferNonce: "nc_101",
    attestationStatus: "pending",
  },
  {
    id: "ptx_002",
    date: "2026-03-21T14:30:00Z",
    senderName: "Charlie Davis",
    senderWallet: "9WzDXwBbmPELwRGW2nFMceR1bYDos2TjMceUPWuJCurv",
    receiverName: "Diana Martinez",
    receiverWallet: "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
    amount: 8500,
    currency: "USDC",
    kytScore: 10,
    kytPassed: true,
    travelRuleHash: "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5",
    transferNonce: "nc_102",
    attestationStatus: "pending",
  },
  {
    id: "ptx_003",
    date: "2026-03-21T13:50:00Z",
    senderName: "Eve Thompson",
    senderWallet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    receiverName: "Frank Wilson",
    receiverWallet: "BPFLoaderUpgradeab1e11111111111111111111111",
    amount: 125000,
    currency: "USDC",
    kytScore: 68,
    kytPassed: false,
    travelRuleHash: "e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6",
    transferNonce: "nc_103",
    attestationStatus: "pending",
  },
  {
    id: "ptx_004",
    date: "2026-03-21T12:15:00Z",
    senderName: "Grace Lee",
    senderWallet: "2fmz766YEQBHrnnFQKMvAxKwf1BDSoTh34E1YmTCqAAo",
    receiverName: "Henry Park",
    receiverWallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    amount: 19750,
    currency: "USDC",
    kytScore: 20,
    kytPassed: true,
    travelRuleHash: "f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7",
    transferNonce: "nc_104",
    attestationStatus: "pending",
  },
];

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function AdminPage() {
  const [transfers, setTransfers] = useState<PendingTransfer[]>(INITIAL_TRANSFERS);

  const handleAttest = async (id: string) => {
    setTransfers((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, attestationStatus: "attesting" as const, error: undefined } : t
      )
    );

    const transfer = transfers.find((t) => t.id === id);
    if (!transfer) return;

    try {
      const result = await attestOracle({
        transferNonce: transfer.transferNonce,
      });
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                attestationStatus: "attested" as const,
                txSignature: result.txSignature,
                attestedAt: result.attestedAt,
              }
            : t
        )
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Attestation failed";
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, attestationStatus: "failed" as const, error: message }
            : t
        )
      );
    }
  };

  const pendingCount = transfers.filter(
    (t) => t.attestationStatus === "pending"
  ).length;
  const attestedCount = transfers.filter(
    (t) => t.attestationStatus === "attested"
  ).length;

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
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-100">
              <Clock className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-700">
                {pendingCount} Pending
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">
                {attestedCount} Attested
              </span>
            </div>
          </div>
        </div>

        {/* Transfer cards */}
        <div className="space-y-4">
          {transfers.map((tx) => (
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
                {/* Transfer info */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Parties */}
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">
                      Transfer
                    </p>
                    <p className="text-sm font-semibold text-gray-900">
                      {tx.senderName} → {tx.receiverName}
                    </p>
                    <p className="text-xs font-mono text-gray-400 mt-0.5">
                      {shortAddr(tx.senderWallet)} →{" "}
                      {shortAddr(tx.receiverWallet)}
                    </p>
                  </div>

                  {/* Amount */}
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">
                      Amount
                    </p>
                    <p className="text-sm font-bold text-gray-900">
                      ${tx.amount.toLocaleString()}{" "}
                      <span className="text-xs font-medium text-gray-400">
                        {tx.currency}
                      </span>
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
                    <p className="text-xs text-gray-500 font-medium mb-1">
                      KYT Score
                    </p>
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

                  {/* Travel Rule Hash */}
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">
                      Travel Rule Hash
                    </p>
                    <p className="text-xs font-mono text-gray-600 break-all">
                      {tx.travelRuleHash.slice(0, 24)}...
                    </p>
                  </div>
                </div>

                {/* Action */}
                <div className="flex-shrink-0 flex items-center gap-3 lg:pl-4 lg:border-l lg:border-gray-100">
                  {tx.attestationStatus === "pending" && (
                    <button
                      onClick={() => handleAttest(tx.id)}
                      disabled={!tx.kytPassed}
                      className={`btn-primary min-w-[120px] ${
                        !tx.kytPassed ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                      title={
                        !tx.kytPassed
                          ? "Cannot attest: KYT check failed"
                          : "Attest this transfer on-chain"
                      }
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
                        <p className="text-xs text-red-500 max-w-[200px]">
                          {tx.error}
                        </p>
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
      </div>
    </div>
  );
}
