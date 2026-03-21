"use client";

import React, { useState } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  ShieldCheck,
  TrendingUp,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { explorerUrl } from "@/lib/constants";
import type { Transfer } from "@/lib/types";

const MOCK_TRANSFERS: Transfer[] = [
  {
    id: "txn_001",
    date: "2026-03-21T14:32:00Z",
    senderWallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    senderName: "Alice Johnson",
    receiverWallet: "DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy",
    receiverName: "Bob Williams",
    amount: 25000,
    currency: "USDC",
    kytScore: 12,
    kytPassed: true,
    travelRuleHash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
    travelRuleStatus: "verified",
    settlementStatus: "settled",
    txSignature: "5UfDuX7hXsMquqQNwNcVpEDkYSBvd3SAmNFdMiR5fN8RPhHj9vKjXHCdXeSfhMNvmpJoAaLJdPdWVR7GVCdQPqmD",
    transferNonce: "nc_001",
  },
  {
    id: "txn_002",
    date: "2026-03-21T13:15:00Z",
    senderWallet: "9WzDXwBbmPELwRGW2nFMceR1bYDos2TjMceUPWuJCurv",
    senderName: "Charlie Davis",
    receiverWallet: "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
    receiverName: "Diana Martinez",
    amount: 5500,
    currency: "USDC",
    kytScore: 8,
    kytPassed: true,
    travelRuleHash: "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
    travelRuleStatus: "verified",
    settlementStatus: "settled",
    txSignature: "3kGxH8qN9YfLmVJwR4pTdWs7BzACn2U6vXeM5hPfDjKt8rSuYwZ3aLcNbQ7gE9Fv",
    transferNonce: "nc_002",
  },
  {
    id: "txn_003",
    date: "2026-03-21T11:45:00Z",
    senderWallet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    senderName: "Eve Thompson",
    receiverWallet: "BPFLoaderUpgradeab1e11111111111111111111111",
    receiverName: "Frank Wilson",
    amount: 150000,
    currency: "USDC",
    kytScore: 72,
    kytPassed: false,
    travelRuleHash: "",
    travelRuleStatus: "pending",
    settlementStatus: "rejected",
    transferNonce: "nc_003",
  },
  {
    id: "txn_004",
    date: "2026-03-21T10:20:00Z",
    senderWallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    senderName: "Alice Johnson",
    receiverWallet: "2fmz766YEQBHrnnFQKMvAxKwf1BDSoTh34E1YmTCqAAo",
    receiverName: "Grace Lee",
    amount: 12750,
    currency: "USDC",
    kytScore: 18,
    kytPassed: true,
    travelRuleHash: "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5",
    travelRuleStatus: "packaged",
    settlementStatus: "cleared",
    transferNonce: "nc_004",
  },
  {
    id: "txn_005",
    date: "2026-03-20T16:50:00Z",
    senderWallet: "DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy",
    senderName: "Bob Williams",
    receiverWallet: "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
    receiverName: "Diana Martinez",
    amount: 3200,
    currency: "USDC",
    kytScore: 5,
    kytPassed: true,
    travelRuleHash: "e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6",
    travelRuleStatus: "verified",
    settlementStatus: "settled",
    txSignature: "4jYvN9zKwR5mXhTp8sU2bQcA7dF3eGnL6kWxJ1oPqMrS",
    transferNonce: "nc_005",
  },
  {
    id: "txn_006",
    date: "2026-03-20T09:10:00Z",
    senderWallet: "9WzDXwBbmPELwRGW2nFMceR1bYDos2TjMceUPWuJCurv",
    senderName: "Charlie Davis",
    receiverWallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    receiverName: "Alice Johnson",
    amount: 8900,
    currency: "USDC",
    kytScore: 22,
    kytPassed: true,
    travelRuleHash: "f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7",
    travelRuleStatus: "verified",
    settlementStatus: "pending",
    transferNonce: "nc_006",
  },
];

function shortAddr(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function StatusBadge({ status }: { status: Transfer["settlementStatus"] }) {
  const classes: Record<string, string> = {
    pending: "badge-pending",
    cleared: "badge-cleared",
    settled: "badge-settled",
    rejected: "badge-rejected",
  };
  const labels: Record<string, string> = {
    pending: "Pending",
    cleared: "Cleared",
    settled: "Settled",
    rejected: "Rejected",
  };
  return <span className={classes[status]}>{labels[status]}</span>;
}

function TravelRuleBadge({ status }: { status: Transfer["travelRuleStatus"] }) {
  const map: Record<string, { className: string; label: string }> = {
    pending: { className: "badge-pending", label: "Pending" },
    packaged: { className: "badge-cleared", label: "Packaged" },
    verified: { className: "badge-settled", label: "Verified" },
  };
  const { className, label } = map[status];
  return <span className={className}>{label}</span>;
}

function KytBadge({ score, passed }: { score: number; passed: boolean }) {
  return (
    <span
      className={`badge ${
        !passed
          ? "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20"
          : score <= 20
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
          : "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20"
      }`}
    >
      {score}/100
    </span>
  );
}

export default function DashboardPage() {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const totalVolume = MOCK_TRANSFERS.reduce((s, t) => s + t.amount, 0);
  const totalTransfers = MOCK_TRANSFERS.length;
  const avgRiskScore = Math.round(
    MOCK_TRANSFERS.reduce((s, t) => s + t.kytScore, 0) / totalTransfers
  );
  const complianceRate = Math.round(
    (MOCK_TRANSFERS.filter((t) => t.kytPassed).length / totalTransfers) * 100
  );

  const stats = [
    {
      label: "Total Volume",
      value: `$${totalVolume.toLocaleString()}`,
      sub: "USDC",
      icon: TrendingUp,
      color: "text-primary-600",
      bg: "bg-primary-50",
    },
    {
      label: "Total Transfers",
      value: totalTransfers.toString(),
      sub: "transactions",
      icon: ArrowUpRight,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Avg Risk Score",
      value: `${avgRiskScore}/100`,
      sub: "KYT score",
      icon: Activity,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Compliance Rate",
      value: `${complianceRate}%`,
      sub: "passed KYT",
      icon: ShieldCheck,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
  ];

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Transaction history and compliance overview
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <div key={stat.label} className="card">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center`}
                >
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">
                    {stat.label}
                  </p>
                  <p className="text-xl font-bold text-gray-900">
                    {stat.value}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">
              Recent Transfers
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left font-medium text-gray-500 px-6 py-3">
                    Date
                  </th>
                  <th className="text-left font-medium text-gray-500 px-6 py-3">
                    Transfer
                  </th>
                  <th className="text-right font-medium text-gray-500 px-6 py-3">
                    Amount
                  </th>
                  <th className="text-center font-medium text-gray-500 px-6 py-3">
                    KYT Score
                  </th>
                  <th className="text-center font-medium text-gray-500 px-6 py-3">
                    Travel Rule
                  </th>
                  <th className="text-center font-medium text-gray-500 px-6 py-3">
                    Status
                  </th>
                  <th className="px-6 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {MOCK_TRANSFERS.map((tx) => {
                  const isExpanded = expandedRow === tx.id;
                  return (
                    <React.Fragment key={tx.id}>
                      <tr
                        className="hover:bg-gray-50/80 transition-colors cursor-pointer"
                        onClick={() =>
                          setExpandedRow(isExpanded ? null : tx.id)
                        }
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                          {new Date(tx.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                          <span className="text-gray-400 ml-1.5 text-xs">
                            {new Date(tx.date).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-gray-900">
                              {tx.senderName.split(" ")[0]}
                            </span>
                            <ArrowDownRight className="w-3.5 h-3.5 text-gray-400" />
                            <span className="font-medium text-gray-900">
                              {tx.receiverName.split(" ")[0]}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 font-mono mt-0.5">
                            {shortAddr(tx.senderWallet)} →{" "}
                            {shortAddr(tx.receiverWallet)}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-gray-900">
                          $
                          {tx.amount.toLocaleString("en-US", {
                            minimumFractionDigits: 0,
                          })}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <KytBadge score={tx.kytScore} passed={tx.kytPassed} />
                        </td>
                        <td className="px-6 py-4 text-center">
                          <TravelRuleBadge status={tx.travelRuleStatus} />
                        </td>
                        <td className="px-6 py-4 text-center">
                          <StatusBadge status={tx.settlementStatus} />
                        </td>
                        <td className="px-6 py-4">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-gray-50/60">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs animate-fade-in">
                              <div>
                                <p className="text-gray-500 font-medium mb-1">
                                  Sender
                                </p>
                                <p className="text-gray-900 font-medium">
                                  {tx.senderName}
                                </p>
                                <p className="font-mono text-gray-500 break-all">
                                  {tx.senderWallet}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-500 font-medium mb-1">
                                  Receiver
                                </p>
                                <p className="text-gray-900 font-medium">
                                  {tx.receiverName}
                                </p>
                                <p className="font-mono text-gray-500 break-all">
                                  {tx.receiverWallet}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-500 font-medium mb-1">
                                  Compliance Details
                                </p>
                                <div className="space-y-1">
                                  <p>
                                    <span className="text-gray-500">
                                      KYT Score:{" "}
                                    </span>
                                    <span className="text-gray-900 font-medium">
                                      {tx.kytScore}/100
                                    </span>
                                  </p>
                                  {tx.travelRuleHash && (
                                    <p>
                                      <span className="text-gray-500">
                                        TR Hash:{" "}
                                      </span>
                                      <span className="font-mono text-gray-700">
                                        {tx.travelRuleHash.slice(0, 20)}...
                                      </span>
                                    </p>
                                  )}
                                  {tx.txSignature && (
                                    <a
                                      href={explorerUrl(tx.txSignature)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      View on Explorer
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
