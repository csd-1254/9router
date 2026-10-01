"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Button } from "@/shared/components";
import Pagination from "@/shared/components/Pagination";
import { AI_PROVIDERS, getProviderByAlias } from "@/shared/constants/providers";
import RequestLogDetailModal from "./RequestLogDetailModal";

const REFRESH_MS = 1000;

// Resolve a provider id to its display name, matching the Usage → Details tab.
// Custom/compatible nodes carry their name in /api/provider-nodes; built-ins
// come from AI_PROVIDERS. Cached module-wide so repeated polls don't refetch.
let providerNameCache = null;
async function loadProviderNames() {
  if (providerNameCache) return providerNameCache;
  const nodes = await fetch("/api/provider-nodes").then((r) => r.json()).then((d) => d.nodes || []).catch(() => []);
  providerNameCache = { ...AI_PROVIDERS };
  for (const node of nodes) providerNameCache[node.id] = node.name;
  return providerNameCache;
}
function providerName(id, cache) {
  if (!id) return "-";
  const cached = cache?.[id];
  if (typeof cached === "string") return cached;
  if (cached?.name) return cached.name;
  return getProviderByAlias(id)?.name || AI_PROVIDERS[id]?.name || id;
}

function formatDuration(ms) {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function StatusCell({ status }) {
  const isSuccess = status === "success" || status === "OK" || (typeof status === "number" && status >= 200 && status < 400);
  const isFailed = status === "error" || (typeof status === "number" && status >= 400) || String(status).toUpperCase().includes("FAILED");
  const isPending = status === "PENDING";
  const color = isSuccess ? "text-green-600" : isFailed ? "text-red-600" : isPending ? "text-primary animate-pulse" : "text-text-muted";
  return <span className={`font-semibold ${color}`}>{String(status ?? "-")}</span>;
}

export default function RequestLogsClient() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedLogId, setSelectedLogId] = useState(null);
  const [nameCache, setNameCache] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, totalItems: 0, totalPages: 1 });

  const { page, pageSize } = pagination;

  const fetchLogs = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/usage/request-details?page=${page}&pageSize=${pageSize}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.details || []);
      if (data.pagination) setPagination((prev) => ({ ...prev, ...data.pagination }));
    } catch (error) {
      console.error("Failed to fetch request logs:", error);
      setLoadError(error.message);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    loadProviderNames().then(setNameCache).catch(() => {});
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs(true);
  }, [fetchLogs]);

  // Live tail: always-on silent polling (no toggle), matching the other
  // dashboards. Data has a short write-buffer floor, so SSE would gain nothing.
  // Keeps polling with the detail modal open — it's an overlay fetched by id,
  // unaffected by the list reshuffling.
  useEffect(() => {
    const interval = setInterval(() => fetchLogs(false), REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const setPage = (p) => setPagination((prev) => ({ ...prev, page: p }));
  const setPageSize = (s) => setPagination((prev) => ({ ...prev, pageSize: s, page: 1 }));

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      {/* Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          {loading && logs.length === 0 ? (
            <div className="p-8 text-center text-text-muted">
              <span className="material-symbols-outlined animate-spin text-[20px] align-middle mr-2">progress_activity</span>
              Loading request logs...
            </div>
          ) : loadError ? (
            <div className="p-8 text-center">
              <div className="text-error mb-2">Failed to load request logs.</div>
              <Button size="sm" variant="outline" onClick={() => fetchLogs(true)}>Retry</Button>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-text-muted">
              <div className="mb-1">No request logs yet.</div>
              <div className="text-xs opacity-70">Generate a request through 9Router and it will appear here.</div>
            </div>
          ) : (
            <table className="w-full min-w-[880px]">
              <thead>
                <tr className="border-b border-black/5 dark:border-white/5">
                  <th className="text-left p-4 text-sm font-semibold text-text-main">Timestamp</th>
                  <th className="text-left p-4 text-sm font-semibold text-text-main">Status</th>
                  <th className="text-left p-4 text-sm font-semibold text-text-main">Model</th>
                  <th className="text-left p-4 text-sm font-semibold text-text-main">Provider</th>
                  <th className="text-left p-4 text-sm font-semibold text-text-main">Account</th>
                  <th className="text-right p-4 text-sm font-semibold text-text-main">Tokens In/Out</th>
                  <th className="text-right p-4 text-sm font-semibold text-text-main">Duration</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, index) => {
                  const durationMs = log.durationMs ?? log.latency?.total ?? null;
                  const inputTokens = log.tokens?.prompt_tokens ?? log.tokens?.input_tokens ?? 0;
                  const outputTokens = log.tokens?.completion_tokens ?? log.tokens?.output_tokens ?? 0;
                  return (
                    <tr
                      key={`${log.id}-${index}`}
                      onClick={() => setSelectedLogId(log.id)}
                      className="border-b border-black/5 dark:border-white/5 last:border-b-0 cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="whitespace-nowrap p-4 text-sm text-text-muted">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="p-4 text-sm"><StatusCell status={log.status} /></td>
                      <td className="max-w-[220px] truncate p-4 font-mono text-sm text-primary" title={log.model}>
                        {log.model || "-"}
                      </td>
                      <td className="max-w-[180px] truncate p-4 text-sm font-medium text-text-main" title={log.provider}>
                        {providerName(log.provider, nameCache)}
                      </td>
                      <td className="max-w-[130px] truncate p-4 text-sm text-text-muted font-mono" title={log.connectionId}>
                        {log.connectionId ? `${log.connectionId.slice(0, 8)}...` : "-"}
                      </td>
                      <td className="whitespace-nowrap p-4 text-right text-sm font-mono">
                        <span className="text-text-muted">IN </span>
                        <span className="text-primary">{inputTokens}</span>
                        <span className="mx-1 text-border">|</span>
                        <span className="text-text-muted">OUT </span>
                        <span className="text-green-600">{outputTokens}</span>
                      </td>
                      <td className="p-4 text-right text-sm font-mono text-text-main">
                        {formatDuration(durationMs)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {!loadError && logs.length > 0 && (
          <div className="border-t border-black/5 dark:border-white/5">
            <Pagination
              currentPage={page}
              pageSize={pageSize}
              totalItems={pagination.totalItems}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        )}
      </Card>

      {selectedLogId && (
        <RequestLogDetailModal logId={selectedLogId} onClose={() => setSelectedLogId(null)} />
      )}
    </div>
  );
}
