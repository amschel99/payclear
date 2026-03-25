"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  ShieldCheck,
  TrendingUp,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Loader2,
  KeyRound,
  RefreshCw,
  AlertCircle,
  Search,
  X,
} from "lucide-react";
import { explorerUrl } from "@/lib/constants";
import { listTransfers, getApiKey, saveApiKey } from "@/lib/api";
import type { Transfer, ApiTransfer } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────

type DateRange = "all" | "today" | "7d" | "30d";
type StatusFilter = "all" | Transfer["settlementStatus"];
type SortCol = "date" | "amount" | "kytScore";
type SortDir = "asc" | "desc";

// ─── Helpers ──────────────────────────────────────────────────

function shortAddr(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function mapApiTransfer(t: ApiTransfer): Transfer {
  const statusMap: Record<number, Transfer["settlementStatus"]> = {
    0: "pending",
    1: "settled",
    2: "rejected",
  };
  let settlementStatus: Transfer["settlementStatus"] =
    statusMap[t.status] ?? "pending";
  if (
    t.status === 0 &&
    (t.screeningStatus === "blocked" || t.screeningStatus === "flagged")
  ) {
    settlementStatus = "rejected";
  }

  const kytScore = t.senderRiskScore ?? 0;
  const kytPassed = settlementStatus !== "rejected" && kytScore < 70;

  return {
    id: t.id,
    date: t.createdAt,
    senderWallet: t.senderWallet,
    senderName: shortAddr(t.senderWallet),
    receiverWallet: t.receiverWallet,
    receiverName: shortAddr(t.receiverWallet),
    // USDC has 6 decimal places; raw amount is in micro-USDC
    amount: Number(t.amount) / 1_000_000,
    currency: "USDC",
    kytScore,
    kytPassed,
    travelRuleHash: t.travelRuleId ?? "",
    travelRuleStatus: t.travelRuleId ? "verified" : "pending",
    settlementStatus,
    txSignature: t.txSignature ?? undefined,
    transferNonce: t.nonce,
  };
}

function getDateCutoff(range: DateRange): Date | null {
  if (range === "all") return null;
  const now = new Date();
  if (range === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (range === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (range === "30d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  }
  return null;
}

// ─── Sub-components ───────────────────────────────────────────

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

function SortIcon({
  col,
  activeCol,
  dir,
}: {
  col: SortCol;
  activeCol: SortCol;
  dir: SortDir;
}) {
  if (col !== activeCol)
    return <ChevronsUpDown className="w-3.5 h-3.5 text-gray-300 ml-1 inline" />;
  return dir === "asc" ? (
    <ChevronUp className="w-3.5 h-3.5 text-primary-600 ml-1 inline" />
  ) : (
    <ChevronDown className="w-3.5 h-3.5 text-primary-600 ml-1 inline" />
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function DashboardPage() {
  // Data state
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auth state
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [hasKey, setHasKey] = useState(false);

  // Filter state
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Sort state — default: newest first
  const [sortCol, setSortCol] = useState<SortCol>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Table UI state
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────

  const fetchTransfers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTransfers(50, 0);
      setTransfers(data.map(mapApiTransfer));
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to load transfers";
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

  // ── Sort handler ─────────────────────────────────────────────

  const handleSort = (col: SortCol) => {
    if (col === sortCol) {
      setSortDir((d: SortDir) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
    setExpandedRow(null);
  };

  // ── Derived: filtered + sorted transfers ─────────────────────

  const filteredTransfers = useMemo(() => {
    let result = transfers;

    // Date range
    const cutoff = getDateCutoff(dateRange);
    if (cutoff) {
      result = result.filter((t: Transfer) => new Date(t.date) >= cutoff);
    }

    // Wallet search
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (t: Transfer) =>
          t.senderWallet.toLowerCase().includes(q) ||
          t.receiverWallet.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((t: Transfer) => t.settlementStatus === statusFilter);
    }

    // Sort
    result = [...result].sort((a, b) => {
      let aVal: number;
      let bVal: number;
      if (sortCol === "date") {
        aVal = new Date(a.date).getTime();
        bVal = new Date(b.date).getTime();
      } else if (sortCol === "amount") {
        aVal = a.amount;
        bVal = b.amount;
      } else {
        aVal = a.kytScore;
        bVal = b.kytScore;
      }
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });

    return result;
  }, [transfers, dateRange, search, statusFilter, sortCol, sortDir]);

  const hasActiveFilters =
    dateRange !== "all" || search.trim() !== "" || statusFilter !== "all";

  const clearFilters = () => {
    setDateRange("all");
    setSearch("");
    setStatusFilter("all");
  };

  // ── Stats — computed from filtered view ──────────────────────

  const totalVolume = filteredTransfers.reduce(
    (s: number, t: Transfer) => s + t.amount,
    0
  );
  const totalCount = filteredTransfers.length;
  const avgRiskScore =
    totalCount > 0
      ? Math.round(
          filteredTransfers.reduce(
            (s: number, t: Transfer) => s + t.kytScore,
            0
          ) / totalCount
        )
      : 0;
  const complianceRate =
    totalCount > 0
      ? Math.round(
          (filteredTransfers.filter((t: Transfer) => t.kytPassed).length /
            totalCount) *
            100
        )
      : 0;

  const stats = [
    {
      label: "Total Volume",
      value: `$${totalVolume.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
      sub: "USDC",
      icon: TrendingUp,
      color: "text-primary-600",
      bg: "bg-primary-50",
    },
    {
      label: "Total Transfers",
      value: totalCount.toString(),
      sub: hasActiveFilters ? "filtered" : "transactions",
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

  const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
    { value: "all", label: "All time" },
    { value: "today", label: "Today" },
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
  ];

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              Transaction history and compliance overview
            </p>
          </div>
          {hasKey && (
            <button
              onClick={fetchTransfers}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          )}
        </div>

        {/* API key banner */}
        {!hasKey && (
          <div className="mb-6 p-4 rounded-xl border border-amber-200 bg-amber-50 flex flex-col sm:flex-row sm:items-center gap-3">
            <KeyRound className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">
                API key required
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Enter your institutional API key to load live transfer data, or
                set{" "}
                <code className="font-mono bg-amber-100 px-1 rounded">
                  NEXT_PUBLIC_API_KEY
                </code>{" "}
                in{" "}
                <code className="font-mono bg-amber-100 px-1 rounded">
                  .env.local
                </code>
                .
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

        {/* Stats — reflect filtered view */}
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
                  <p className="text-xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-xs text-gray-400">{stat.sub}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Table card */}
        <div className="card p-0 overflow-hidden">

          {/* Toolbar */}
          <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                className="input pl-9 text-sm"
                placeholder="Search wallet address…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status filter */}
            <select
              className="input text-sm w-auto"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="cleared">Cleared</option>
              <option value="settled">Settled</option>
              <option value="rejected">Rejected</option>
            </select>

            {/* Date range pills */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
              {DATE_RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDateRange(opt.value)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    dateRange === opt.value
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Clear filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </button>
            )}

            {/* Record count */}
            <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">
              {filteredTransfers.length}
              {hasActiveFilters && ` of ${transfers.length}`} records
            </span>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading transfers…</span>
            </div>
          )}

          {/* Empty — no key */}
          {!loading && !hasKey && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <KeyRound className="w-8 h-8 mb-3" />
              <p className="text-sm font-medium">
                Connect an API key to see data
              </p>
            </div>
          )}

          {/* Empty — no data at all */}
          {!loading && hasKey && transfers.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Activity className="w-8 h-8 mb-3" />
              <p className="text-sm font-medium">No transfers yet</p>
              <p className="text-xs mt-1">
                Transfers submitted via the Send page will appear here.
              </p>
            </div>
          )}

          {/* Empty — filters match nothing */}
          {!loading &&
            hasKey &&
            transfers.length > 0 &&
            filteredTransfers.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Search className="w-8 h-8 mb-3" />
                <p className="text-sm font-medium">No results</p>
                <p className="text-xs mt-1">
                  Try adjusting your search or filters.
                </p>
                <button
                  onClick={clearFilters}
                  className="mt-3 text-xs text-primary-600 hover:text-primary-700 font-medium"
                >
                  Clear filters
                </button>
              </div>
            )}

          {/* Table */}
          {!loading && filteredTransfers.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    {/* Sortable: Date */}
                    <th
                      className="text-left font-medium text-gray-500 px-6 py-3 cursor-pointer select-none hover:text-gray-700 transition-colors"
                      onClick={() => handleSort("date")}
                    >
                      Date
                      <SortIcon col="date" activeCol={sortCol} dir={sortDir} />
                    </th>
                    <th className="text-left font-medium text-gray-500 px-6 py-3">
                      Transfer
                    </th>
                    {/* Sortable: Amount */}
                    <th
                      className="text-right font-medium text-gray-500 px-6 py-3 cursor-pointer select-none hover:text-gray-700 transition-colors"
                      onClick={() => handleSort("amount")}
                    >
                      Amount
                      <SortIcon
                        col="amount"
                        activeCol={sortCol}
                        dir={sortDir}
                      />
                    </th>
                    {/* Sortable: KYT Score */}
                    <th
                      className="text-center font-medium text-gray-500 px-6 py-3 cursor-pointer select-none hover:text-gray-700 transition-colors"
                      onClick={() => handleSort("kytScore")}
                    >
                      KYT Score
                      <SortIcon
                        col="kytScore"
                        activeCol={sortCol}
                        dir={sortDir}
                      />
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
                  {filteredTransfers.map((tx: Transfer) => {
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
                              <span className="font-medium text-gray-900 font-mono text-xs">
                                {tx.senderName}
                              </span>
                              <ArrowDownRight className="w-3.5 h-3.5 text-gray-400" />
                              <span className="font-medium text-gray-900 font-mono text-xs">
                                {tx.receiverName}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-semibold text-gray-900">
                            $
                            {tx.amount.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <KytBadge
                              score={tx.kytScore}
                              passed={tx.kytPassed}
                            />
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
                                  <p className="font-mono text-gray-700 break-all">
                                    {tx.senderWallet}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-gray-500 font-medium mb-1">
                                    Receiver
                                  </p>
                                  <p className="font-mono text-gray-700 break-all">
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
                                          {tx.travelRuleHash.slice(0, 20)}…
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
          )}
        </div>
      </div>
    </div>
  );
}
