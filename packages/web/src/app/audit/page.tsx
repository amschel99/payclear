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

// ─── Helpers ──────────────────────────────────────────────────

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

// Colour-code event types by category
function eventBadgeClass(eventType: string): string {
  if (eventType.startsWith("transfer."))
    return "bg-blue-100 text-blue-800 border border-blue-200";
  if (eventType.startsWith("entity."))
    return "bg-purple-100 text-purple-800 border border-purple-200";
  if (eventType.startsWith("screening."))
    return "bg-amber-100 text-amber-800 border border-amber-200";
  if (eventType.startsWith("travel_rule."))
    return "bg-teal-100 text-teal-800 border border-teal-200";
  if (eventType.startsWith("policy."))
    return "bg-gray-100 text-gray-700 border border-gray-200";
  if (eventType.startsWith("zk_proof."))
    return "bg-indigo-100 text-indigo-800 border border-indigo-200";
  return "bg-gray-100 text-gray-700 border border-gray-200";
}

// ─── Page ─────────────────────────────────────────────────────

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
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Audit Trail</h1>
            <p className="text-sm text-gray-500 mt-1">
              Immutable log of all compliance events for your institution
            </p>
          </div>
          {hasKey && (
            <button
              onClick={fetchEvents}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          )}
        </div>

        {/* API key banner */}
        {!hasKey && (
          <div className="mb-6 p-4 rounded-xl border border-amber-200 bg-amber-50 flex flex-col sm:flex-row sm:items-center gap-3">
            <KeyRound className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">API key required</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Enter your institutional API key to view the audit log, or set{" "}
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
          <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && events.length === 0 && (
          <div className="card space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && hasKey && events.length === 0 && !error && (
          <div className="card text-center py-16">
            <ScrollText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No audit events yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Events are recorded as your institution performs compliance operations.
            </p>
          </div>
        )}

        {/* Audit table */}
        {events.length > 0 && (
          <div className="card overflow-hidden p-0">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">
                {events.length} event{events.length !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-gray-400">Most recent first</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">
                      Time
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Event
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">
                      Entity
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                      Actor
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                      TX
                    </th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {events.map((ev) => {
                    const isExpanded = expandedRow === ev.id;
                    return (
                      <React.Fragment key={ev.id}>
                        <tr
                          className="hover:bg-gray-50/60 cursor-pointer transition-colors"
                          onClick={() =>
                            setExpandedRow(isExpanded ? null : ev.id)
                          }
                        >
                          <td className="px-5 py-3.5 text-xs text-gray-500 font-mono whitespace-nowrap">
                            {formatTime(ev.createdAt)}
                          </td>
                          <td className="px-5 py-3.5">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${eventBadgeClass(ev.eventType)}`}
                            >
                              {ev.eventType}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 hidden md:table-cell">
                            <div className="text-xs">
                              <span className="font-medium text-gray-700">
                                {ev.entityType}
                              </span>
                              {ev.entityId && (
                                <span className="text-gray-400 ml-1.5 font-mono">
                                  {shortId(ev.entityId)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-xs text-gray-600 font-mono hidden lg:table-cell truncate max-w-[140px]">
                            {ev.actor}
                          </td>
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            {ev.txSignature ? (
                              <a
                                href={explorerUrl(ev.txSignature)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline font-mono"
                              >
                                {ev.txSignature.slice(0, 8)}…
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="pr-4 text-gray-400">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </td>
                        </tr>

                        {/* Expanded details row */}
                        {isExpanded && (
                          <tr className="bg-gray-50/80">
                            <td colSpan={6} className="px-5 py-4">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                <div>
                                  <p className="text-gray-400 font-semibold uppercase tracking-wide mb-1">
                                    Event ID
                                  </p>
                                  <p className="font-mono text-gray-700">{ev.id}</p>
                                </div>
                                {ev.entityId && (
                                  <div>
                                    <p className="text-gray-400 font-semibold uppercase tracking-wide mb-1">
                                      Entity ID
                                    </p>
                                    <p className="font-mono text-gray-700">{ev.entityId}</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-gray-400 font-semibold uppercase tracking-wide mb-1">
                                    Actor
                                  </p>
                                  <p className="font-mono text-gray-700">{ev.actor}</p>
                                </div>
                                {ev.txSignature && (
                                  <div>
                                    <p className="text-gray-400 font-semibold uppercase tracking-wide mb-1">
                                      TX Signature
                                    </p>
                                    <a
                                      href={explorerUrl(ev.txSignature)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-mono text-primary-600 hover:underline break-all"
                                    >
                                      {ev.txSignature}
                                    </a>
                                  </div>
                                )}
                                {ev.details && Object.keys(ev.details).length > 0 && (
                                  <div className="sm:col-span-2">
                                    <p className="text-gray-400 font-semibold uppercase tracking-wide mb-1">
                                      Details
                                    </p>
                                    <pre className="bg-white border border-gray-200 rounded-lg p-3 text-gray-700 overflow-x-auto text-xs leading-relaxed">
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
