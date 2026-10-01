"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Button } from "@/shared/components";
import RequestLogDetailModal from "./RequestLogDetailModal";

function formatDuration(ms) {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function StatusCell({ status }) {
  const isSuccess = status === "success" || status === "OK" || (typeof status === "number" && status >= 200 && status < 400);
  const isFailed = status === "error" || (typeof status === "number" && status >= 400) || String(status).toUpperCase().includes("FAILED");
  const isPending = status === "PENDING";
  const color = isSuccess ? "text-success" : isFailed ? "text-error" : isPending ? "text-primary animate-pulse" : "text-text-muted";
  return <span className={`font-bold ${color}`}>{String(status ?? "-")}</span>;
}

export default function RequestLogsClient() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedLogId, setSelectedLogId] = useState(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLogs = useCallback(async (pageNum, showLoading = true) => {
    if (showLoading) setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/usage/request-details?page=${pageNum}&pageSize=50`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.details || []);
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages || 1);
      }
    } catch (error) {
      console.error("Failed to fetch request logs:", error);
      setLoadError(error.message);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs(page);
  }, [page, fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const interval = setInterval(() => {
      fetchLogs(page, false);
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, page, fetchLogs]);

  const openDetail = (id) => {
    setSelectedLogId(id);
    setAutoRefresh(false);
  };

  const closeDetail = () => {
    setSelectedLogId(null);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Request Logs</h2>
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-text-muted flex items-center gap-2 cursor-pointer">
            <span>Auto Refresh (3s)</span>
            <div
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                autoRefresh ? "bg-primary" : "bg-bg-subtle border border-border"
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  autoRefresh ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </div>
          </label>
          <Button size="sm" variant="outline" icon="refresh" onClick={() => fetchLogs(page)}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden bg-black/5 dark:bg-black/20" padding="none">
        <div className="p-0 overflow-x-auto min-h-[500px] max-h-[calc(100vh-220px)] overflow-y-auto font-mono text-xs">
          {loading && logs.length === 0 ? (
            <div className="p-8 text-center text-text-muted">Loading request logs...</div>
          ) : loadError ? (
            <div className="p-8 text-center">
              <div className="text-error mb-2">Failed to load request logs.</div>
              <Button size="sm" variant="outline" onClick={() => fetchLogs(page)}>Retry</Button>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-text-muted">
              <div className="mb-2">No request logs yet.</div>
              <div className="text-xs opacity-70">Generate a request through 9Router and it will appear here.</div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="sticky top-0 bg-bg-subtle border-b border-border z-10">
                <tr>
                  <th className="px-3 py-2 border-r border-border">Time</th>
                  <th className="px-3 py-2 border-r border-border">Status</th>
                  <th className="px-3 py-2 border-r border-border">Model</th>
                  <th className="px-3 py-2 border-r border-border">Provider</th>
                  <th className="px-3 py-2 border-r border-border">Account</th>
                  <th className="px-3 py-2 border-r border-border">Tokens In/Out</th>
                  <th className="px-3 py-2">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {logs.map((log) => {
                  const d = new Date(log.timestamp);
                  const isValidDate = !isNaN(d.getTime());
                  const timeStr = isValidDate
                    ? `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`
                    : "—:—:—";
                  const durationMs = log.durationMs ?? log.latency?.total ?? null;
                  const inputTokens = log.tokens?.prompt_tokens ?? log.tokens?.input_tokens ?? 0;
                  const outputTokens = log.tokens?.completion_tokens ?? log.tokens?.output_tokens ?? 0;

                  return (
                    <tr
                      key={log.id}
                      onClick={() => openDetail(log.id)}
                      className="cursor-pointer hover:bg-primary/5 transition-colors"
                    >
                      <td className="px-3 py-2 border-r border-border text-text-muted">{timeStr}</td>
                      <td className="px-3 py-2 border-r border-border">
                        <StatusCell status={log.status} />
                      </td>
                      <td className="px-3 py-2 border-r border-border font-medium text-primary truncate max-w-[180px]" title={log.model}>
                        {log.model || "-"}
                      </td>
                      <td className="px-3 py-2 border-r border-border">
                        <span className="px-1.5 py-0.5 rounded bg-bg-subtle border border-border text-[10px] uppercase font-bold">
                          {log.provider || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-r border-border truncate max-w-[130px] text-text-muted" title={log.connectionId}>
                        {log.connectionId ? `${log.connectionId.slice(0, 8)}...` : "-"}
                      </td>
                      <td className="px-3 py-2 border-r border-border text-right whitespace-nowrap">
                        <span className="text-text-muted">IN </span>
                        <span className="text-primary">{inputTokens}</span>
                        <span className="mx-1 text-border">|</span>
                        <span className="text-text-muted">OUT </span>
                        <span className="text-success">{outputTokens}</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatDuration(durationMs)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center px-2">
          <div className="text-sm text-text-muted">
            Page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedLogId && (
        <RequestLogDetailModal logId={selectedLogId} onClose={closeDetail} />
      )}
    </div>
  );
}
