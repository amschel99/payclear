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
  ChevronLeft,
  ChevronRight,
  Loader2,
  KeyRound,
  RefreshCw,
  AlertCircle,
  Search,
  X,
  Download,
  Timer,
} from "lucide-react";
import { explorerUrl } from "@/lib/constants";
import { listTransfers, getApiKey, saveApiKey } from "@/lib/api";
import type { Transfer, ApiTransfer } from "@/lib/types";

type DateRange = "all" | "today" | "7d" | "30d";
type StatusFilter = "all" | Transfer["settlementStatus"];
type SortCol = "date" | "amount" | "kytScore";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

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
          ? "bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/20"
          : score <= 20
          ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20"
          : "bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20"
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
    return <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-700 ml-1 inline" />;
  return dir === "asc" ? (
    <ChevronUp className="w-3.5 h-3.5 text-primary-400 ml-1 inline" />
  ) : (
    <ChevronDown className="w-3.5 h-3.5 text-primary-400 ml-1 inline" />
  );
}

export default function DashboardPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [hasKey, setHasKey] = useState(false);

  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [sortCol, setSortCol] = useState<SortCol>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(30);

  const fetchTransfers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTransfers(50, 0);
      setTransfers(data.map(mapApiTransfer));
      setLastUpdated(new Date());
      setCountdown(30);
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

  useEffect(() => {
    if (!autoRefresh || !hasKey) return;
    const interval = setInterval(fetchTransfers, 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh, hasKey, fetchTransfers]);

  useEffect(() => {
    if (!autoRefresh) return;
    const tick = setInterval(
      () => setCountdown((c: number) => (c > 0 ? c - 1 : 0)),
      1_000
    );
    return () => clearInterval(tick);
  }, [autoRefresh]);

  const handleSaveKey = () => {
    if (!apiKeyInput.trim()) return;
    saveApiKey(apiKeyInput.trim());
    setHasKey(true);
    setApiKeyInput("");
  };

  const handleSort = (col: SortCol) => {
    if (col === sortCol) {
      setSortDir((d: SortDir) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
    setExpandedRow(null);
  };

  const filteredTransfers = useMemo(() => {
    let result = transfers;

    const cutoff = getDateCutoff(dateRange);
    if (cutoff) {
      result = result.filter((t: Transfer) => new Date(t.date) >= cutoff);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (t: Transfer) =>
          t.senderWallet.toLowerCase().includes(q) ||
          t.receiverWallet.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((t: Transfer) => t.settlementStatus === statusFilter);
    }

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

  const totalPages = Math.max(1, Math.ceil(filteredTransfers.length / PAGE_SIZE));
  const paginatedTransfers = filteredTransfers.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  const hasActiveFilters =
    dateRange !== "all" || search.trim() !== "" || statusFilter !== "all";

  const clearFilters = () => {
    setDateRange("all");
    setSearch("");
    setStatusFilter("all");
    setPage(1);
  };

  useEffect(() => {
    setPage(1);
  }, [search, dateRange, statusFilter]);

  const exportCsv = () => {
    const headers = [
      "Date",
      "Sender Wallet",
      "Receiver Wallet",
      "Amount (USDC)",
      "KYT Score",
      "KYT Passed",
      "Travel Rule Hash",
      "Status",
      "TX Signature",
    ];
    const rows = filteredTransfers.map((t: Transfer) => [
      new Date(t.date).toISOString(),
      t.senderWallet,
      t.receiverWallet,
      t.amount.toFixed(6),
      t.kytScore,
      t.kytPassed ? "Yes" : "No",
      t.travelRuleHash,
      t.settlementStatus,
      t.txSignature ?? "",
    ]);
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows]
      .map((row) => row.map((cell: string | number) => escape(String(cell))).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payclear-transfers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
      color: "text-primary-400",
      iconBg: "bg-primary-500/10",
    },
    {
      label: "Total Transfers",
      value: totalCount.toString(),
      sub: hasActiveFilters ? "filtered" : "transactions",
      icon: ArrowUpRight,
      color: "text-emerald-400",
      iconBg: "bg-emerald-500/10",
    },
    {
      label: "Avg Risk Score",
      value: `${avgRiskScore}/100`,
      sub: "KYT score",
      icon: Activity,
      color: "text-amber-400",
      iconBg: "bg-amber-500/10",
    },
    {
      label: "Compliance Rate",
      value: `${complianceRate}%`,
      sub: "passed KYT",
      icon: ShieldCheck,
      color: "text-emerald-400",
      iconBg: "bg-emerald-500/10",
    },
  ];

  const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
    { value: "all", label: "All time" },
    { value: "today", label: "Today" },
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
  ];

  return (
    <div className="min-h-[calc(100vh-64px)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8 animate-slide-up">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Transaction history and compliance overview
            </p>
          </div>
          {hasKey && (
            <div className="flex items-center gap-2">
              {lastUpdated && (
                <span className="hidden sm:block text-xs text-zinc-600">
                  {autoRefresh
                    ? `Refreshing in ${countdown}s`
                    : `Updated ${lastUpdated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`}
                </span>
              )}
              <button
                onClick={() => {
                  setAutoRefresh((v: boolean) => !v);
                  if (!autoRefresh) setCountdown(30);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  autoRefresh
                    ? "bg-primary-500/10 text-primary-400 border border-primary-500/20"
                    : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                }`}
              >
                <Timer className="w-4 h-4" />
                {autoRefresh ? "Live" : "Auto"}
              </button>
              <button
                onClick={fetchTransfers}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300 disabled:opacity-50 transition-all duration-200"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          )}
        </div>

        {/* API key banner */}
        {!hasKey && (
          <div className="mb-8 p-5 rounded-xl border border-amber-500/20 bg-amber-500/5 flex flex-col sm:flex-row sm:items-center gap-4 animate-slide-up stagger-1">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-300">
                API key required
              </p>
              <p className="text-xs text-amber-400/70 mt-0.5">
                Enter your institutional API key to load live transfer data, or
                set{" "}
                <code className="font-mono bg-amber-500/10 px-1 rounded">
                  NEXT_PUBLIC_API_KEY
                </code>{" "}
                in{" "}
                <code className="font-mono bg-amber-500/10 px-1 rounded">
                  .env.local
                </code>
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

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat, i) => (
            <div key={stat.label} className={`card animate-slide-up`} style={{ animationDelay: `${(i + 1) * 50}ms` }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-zinc-500 font-medium">{stat.label}</p>
                <div className={`w-8 h-8 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-xs text-zinc-600 mt-0.5">{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* Table card */}
        <div className="card p-0 overflow-hidden animate-slide-up stagger-5">

          {/* Toolbar */}
          <div className="px-6 py-4 border-b border-white/[0.04] flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none" />
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

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

            <div className="flex items-center gap-0.5 bg-white/[0.03] p-1 rounded-lg border border-white/[0.04]">
              {DATE_RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDateRange(opt.value)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-200 ${
                    dateRange === opt.value
                      ? "bg-white/[0.08] text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </button>
            )}

            {filteredTransfers.length > 0 && (
              <button
                onClick={exportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300 transition-all duration-200 border border-white/[0.06]"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
            )}

            <span className="text-xs text-zinc-600 ml-auto whitespace-nowrap">
              {filteredTransfers.length}
              {hasActiveFilters && ` of ${transfers.length}`} records
            </span>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-20 gap-3 text-zinc-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading transfers…</span>
            </div>
          )}

          {/* Empty — no key */}
          {!loading && !hasKey && (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
              <KeyRound className="w-8 h-8 mb-3" />
              <p className="text-sm font-medium">
                Connect an API key to see data
              </p>
            </div>
          )}

          {/* Empty — no data */}
          {!loading && hasKey && transfers.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
              <Activity className="w-8 h-8 mb-3" />
              <p className="text-sm font-medium">No transfers yet</p>
              <p className="text-xs mt-1 text-zinc-700">
                Transfers submitted via the Send page will appear here.
              </p>
            </div>
          )}

          {/* Empty — filters match nothing */}
          {!loading &&
            hasKey &&
            transfers.length > 0 &&
            filteredTransfers.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
                <Search className="w-8 h-8 mb-3" />
                <p className="text-sm font-medium">No results</p>
                <p className="text-xs mt-1 text-zinc-700">
                  Try adjusting your search or filters.
                </p>
                <button
                  onClick={clearFilters}
                  className="mt-3 text-xs text-primary-400 hover:text-primary-300 font-medium"
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
                  <tr className="border-b border-white/[0.04]">
                    <th
                      className="text-left font-medium text-zinc-500 px-6 py-3.5 cursor-pointer select-none hover:text-zinc-300 transition-colors text-xs uppercase tracking-wider"
                      onClick={() => handleSort("date")}
                    >
                      Date
                      <SortIcon col="date" activeCol={sortCol} dir={sortDir} />
                    </th>
                    <th className="text-left font-medium text-zinc-500 px-6 py-3.5 text-xs uppercase tracking-wider">
                      Transfer
                    </th>
                    <th
                      className="text-right font-medium text-zinc-500 px-6 py-3.5 cursor-pointer select-none hover:text-zinc-300 transition-colors text-xs uppercase tracking-wider"
                      onClick={() => handleSort("amount")}
                    >
                      Amount
                      <SortIcon
                        col="amount"
                        activeCol={sortCol}
                        dir={sortDir}
                      />
                    </th>
                    <th
                      className="text-center font-medium text-zinc-500 px-6 py-3.5 cursor-pointer select-none hover:text-zinc-300 transition-colors text-xs uppercase tracking-wider"
                      onClick={() => handleSort("kytScore")}
                    >
                      KYT Score
                      <SortIcon
                        col="kytScore"
                        activeCol={sortCol}
                        dir={sortDir}
                      />
                    </th>
                    <th className="text-center font-medium text-zinc-500 px-6 py-3.5 text-xs uppercase tracking-wider">
                      Travel Rule
                    </th>
                    <th className="text-center font-medium text-zinc-500 px-6 py-3.5 text-xs uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3.5 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {paginatedTransfers.map((tx: Transfer) => {
                    const isExpanded = expandedRow === tx.id;
                    return (
                      <React.Fragment key={tx.id}>
                        <tr
                          className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                          onClick={() =>
                            setExpandedRow(isExpanded ? null : tx.id)
                          }
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-zinc-400">
                            {new Date(tx.date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                            <span className="text-zinc-600 ml-1.5 text-xs">
                              {new Date(tx.date).toLocaleTimeString("en-US", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-zinc-200 font-mono text-xs">
                                {tx.senderName}
                              </span>
                              <ArrowDownRight className="w-3.5 h-3.5 text-zinc-600" />
                              <span className="font-medium text-zinc-200 font-mono text-xs">
                                {tx.receiverName}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-semibold text-white">
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
                              <ChevronUp className="w-4 h-4 text-zinc-600" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-zinc-600" />
                            )}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-white/[0.02]">
                            <td colSpan={7} className="px-6 py-5">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs">
                                <div>
                                  <p className="text-zinc-500 font-medium mb-1.5">
                                    Sender
                                  </p>
                                  <p className="font-mono text-zinc-300 break-all">
                                    {tx.senderWallet}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-zinc-500 font-medium mb-1.5">
                                    Receiver
                                  </p>
                                  <p className="font-mono text-zinc-300 break-all">
                                    {tx.receiverWallet}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-zinc-500 font-medium mb-1.5">
                                    Compliance Details
                                  </p>
                                  <div className="space-y-1.5">
                                    <p>
                                      <span className="text-zinc-500">
                                        KYT Score:{" "}
                                      </span>
                                      <span className="text-zinc-200 font-medium">
                                        {tx.kytScore}/100
                                      </span>
                                    </p>
                                    {tx.travelRuleHash && (
                                      <p>
                                        <span className="text-zinc-500">
                                          TR Hash:{" "}
                                        </span>
                                        <span className="font-mono text-zinc-400">
                                          {tx.travelRuleHash.slice(0, 20)}…
                                        </span>
                                      </p>
                                    )}
                                    {tx.txSignature && (
                                      <a
                                        href={explorerUrl(tx.txSignature)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300 font-medium"
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

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="px-6 py-4 border-t border-white/[0.04] flex items-center justify-between">
              <span className="text-xs text-zinc-600">
                Page {page} of {totalPages} &mdash;{" "}
                {filteredTransfers.length} records
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p: number) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg text-zinc-500 hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(
                    (n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1
                  )
                  .reduce<(number | "…")[]>((acc, n, idx, arr) => {
                    if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push("…");
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === "…" ? (
                      <span key={`ellipsis-${idx}`} className="px-1 text-xs text-zinc-600">
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => setPage(item as number)}
                        className={`min-w-[28px] h-7 rounded-lg text-xs font-medium transition-all duration-200 ${
                          page === item
                            ? "bg-primary-600 text-white shadow-lg shadow-primary-600/20"
                            : "text-zinc-500 hover:bg-white/[0.04]"
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}
                <button
                  onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg text-zinc-500 hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
