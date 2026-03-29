"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ScrollText,
  KeyRound,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { listAuditEvents, getApiKey, saveApiKey } from "@/lib/api";
import { explorerUrl } from "@/lib/constants";
import type { ApiAuditEvent } from "@/lib/types";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function shortId(id: string | null): string {
  if (!id) return "—";
  return `${id.slice(0, 8)}…`;
}

function eventBadgeClass(eventType: string): string {
  if (eventType.startsWith("transfer."))
    return "bg-blue-500/10 text-blue-400 ring-1 ring-inset ring-blue-500/20";
  if (eventType.startsWith("entity."))
    return "bg-purple-500/10 text-purple-400 ring-1 ring-inset ring-purple-500/20";
  if (eventType.startsWith("screening."))
    return "bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20";
  if (eventType.startsWith("travel_rule."))
    return "bg-teal-500/10 text-teal-400 ring-1 ring-inset ring-teal-500/20";
  if (eventType.startsWith("policy."))
    return "bg-zinc-800 text-zinc-400 ring-1 ring-inset ring-zinc-700";
  if (eventType.startsWith("zk_proof."))
    return "bg-indigo-500/10 text-indigo-400 ring-1 ring-inset ring-indigo-500/20";
  return "bg-zinc-800 text-zinc-400 ring-1 ring-inset ring-zinc-700";
}

export default function AuditPage() {
  const [events, setEvents] = useState<ApiAuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAuditEvents(100, 0);
      setEvents(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load audit log";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setHasKey(!!getApiKey());
  }, []);

  useEffect(() => {
    if (hasKey) fetchEvents();
  }, [hasKey, fetchEvents]);

  const handleSaveKey = () => {
    if (!apiKeyInput.trim()) return;
    saveApiKey(apiKeyInput.trim());
    setHasKey(true);
    setApiKeyInput("");
  };

  return (
    <div className="min-h-[calc(100vh-64px)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8 animate-slide-up">
          <div>
            <h1 className="text-2xl font-bold text-white">Audit Trail</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Immutable log of all compliance events for your institution
            </p>
          </div>
          {hasKey && (
            <button
              onClick={fetchEvents}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300 disabled:opacity-50 transition-all duration-200"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          )}
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
                Enter your institutional API key to view the audit log, or set{" "}
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKeyInput(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && handleSaveKey()}
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

        {/* Loading skeleton */}
        {loading && events.length === 0 && (
          <div className="card space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg skeleton" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && hasKey && events.length === 0 && !error && (
          <div className="card text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
              <ScrollText className="w-6 h-6 text-zinc-600" />
            </div>
            <p className="text-zinc-400 font-medium">No audit events yet</p>
            <p className="text-sm text-zinc-600 mt-1">
              Events are recorded as your institution performs compliance operations.
            </p>
          </div>
        )}

        {/* Audit table */}
        {events.length > 0 && (
          <div className="card overflow-hidden p-0 animate-slide-up stagger-2">
            <div className="px-6 py-4 border-b border-white/[0.04] flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-200">
                {events.length} event{events.length !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-zinc-600">Most recent first</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    <th className="text-left px-6 py-3.5 text-xs font-medium text-zinc-500 uppercase tracking-wider w-44">
                      Time
                    </th>
                    <th className="text-left px-6 py-3.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      Event
                    </th>
                    <th className="text-left px-6 py-3.5 text-xs font-medium text-zinc-500 uppercase tracking-wider hidden md:table-cell">
                      Entity
                    </th>
                    <th className="text-left px-6 py-3.5 text-xs font-medium text-zinc-500 uppercase tracking-wider hidden lg:table-cell">
                      Actor
                    </th>
                    <th className="text-left px-6 py-3.5 text-xs font-medium text-zinc-500 uppercase tracking-wider hidden lg:table-cell">
                      TX
                    </th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {events.map((ev) => {
                    const isExpanded = expandedRow === ev.id;
                    return (
                      <React.Fragment key={ev.id}>
                        <tr
                          className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                          onClick={() =>
                            setExpandedRow(isExpanded ? null : ev.id)
                          }
                        >
                          <td className="px-6 py-3.5 text-xs text-zinc-500 font-mono whitespace-nowrap">
                            {formatTime(ev.createdAt)}
                          </td>
                          <td className="px-6 py-3.5">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${eventBadgeClass(ev.eventType)}`}
                            >
                              {ev.eventType}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 hidden md:table-cell">
                            <div className="text-xs">
                              <span className="font-medium text-zinc-300">
                                {ev.entityType}
                              </span>
                              {ev.entityId && (
                                <span className="text-zinc-600 ml-1.5 font-mono">
                                  {shortId(ev.entityId)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-xs text-zinc-500 font-mono hidden lg:table-cell truncate max-w-[140px]">
                            {ev.actor}
                          </td>
                          <td className="px-6 py-3.5 hidden lg:table-cell">
                            {ev.txSignature ? (
                              <a
                                href={explorerUrl(ev.txSignature)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 font-mono transition-colors"
                              >
                                {ev.txSignature.slice(0, 8)}…
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-zinc-700 text-xs">—</span>
                            )}
                          </td>
                          <td className="pr-5 text-zinc-600">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-white/[0.02]">
                            <td colSpan={6} className="px-6 py-5">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
                                <div>
                                  <p className="text-zinc-500 font-semibold uppercase tracking-wider mb-1.5">
                                    Event ID
                                  </p>
                                  <p className="font-mono text-zinc-300">{ev.id}</p>
                                </div>
                                {ev.entityId && (
                                  <div>
                                    <p className="text-zinc-500 font-semibold uppercase tracking-wider mb-1.5">
                                      Entity ID
                                    </p>
                                    <p className="font-mono text-zinc-300">{ev.entityId}</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-zinc-500 font-semibold uppercase tracking-wider mb-1.5">
                                    Actor
                                  </p>
                                  <p className="font-mono text-zinc-300">{ev.actor}</p>
                                </div>
                                {ev.txSignature && (
                                  <div>
                                    <p className="text-zinc-500 font-semibold uppercase tracking-wider mb-1.5">
                                      TX Signature
                                    </p>
                                    <a
                                      href={explorerUrl(ev.txSignature)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-mono text-primary-400 hover:text-primary-300 break-all transition-colors"
                                    >
                                      {ev.txSignature}
                                    </a>
                                  </div>
                                )}
                                {ev.details && Object.keys(ev.details).length > 0 && (
                                  <div className="sm:col-span-2">
                                    <p className="text-zinc-500 font-semibold uppercase tracking-wider mb-1.5">
                                      Details
                                    </p>
                                    <pre className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4 text-zinc-300 overflow-x-auto text-xs leading-relaxed font-mono">
                                      {JSON.stringify(ev.details, null, 2)}
                                    </pre>
                                  </div>
                                )}
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
        )}

      </div>
    </div>
  );
}
