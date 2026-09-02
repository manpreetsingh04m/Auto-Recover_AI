"use client";

import type { AuditLog } from "@/lib/types";
import { formatTime, recoveryBadge, shortAction } from "@/lib/format";

type Props = {
  logs: AuditLog[];
  page: number;
  totalPages: number;
  filter: string;
  onFilter: (value: string) => void;
  onPage: (page: number) => void;
};

export function AuditTable({
  logs,
  page,
  totalPages,
  filter,
  onFilter,
  onPage,
}: Props) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>AI Audit Trail</h2>
          <span>Immutable reasoning + bounded execution log</span>
        </div>
        <div className="filters">
          {[
            { id: "", label: "All" },
            { id: "SUCCESS", label: "Success" },
            { id: "BLOCKED_BY_GUARDRAIL", label: "Blocked" },
          ].map((chip) => (
            <button
              key={chip.id || "all"}
              type="button"
              className={`chip ${filter === chip.id ? "active" : ""}`}
              onClick={() => onFilter(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Invoice</th>
              <th>Action</th>
              <th>Recovery</th>
              <th>Confidence</th>
              <th>Status</th>
              <th>Reasoning</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty">No audit events for this filter.</div>
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const recovery = recoveryBadge(log.recoveryProbability);
                return (
                  <tr key={log._id}>
                    <td className="muted">{formatTime(log.timestamp)}</td>
                    <td className="mono">{log.invoiceId}</td>
                    <td>
                      <span className="pill action">
                        {shortAction(log.executedAction)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`pill recovery ${recovery.className}`}
                        title="Predicted recovery probability"
                      >
                        {recovery.emoji} {recovery.label}
                      </span>
                    </td>
                    <td className="mono">
                      {log.confidenceScore == null
                        ? "—"
                        : log.confidenceScore.toFixed(2)}
                    </td>
                    <td>
                      <span
                        className={`pill ${
                          log.status === "SUCCESS" ? "success" : "blocked"
                        }`}
                      >
                        {log.status === "SUCCESS" ? "SUCCESS" : "BLOCKED"}
                      </span>
                    </td>
                    <td>
                      <div className="reason">
                        <strong>{log.rootCause || "—"}</strong>
                        <div className="muted" style={{ marginTop: 4 }}>
                          {log.guardrailReason || log.aiReasoning}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="panel-body">
        <div className="pager">
          <span className="muted">
            Page {page} of {Math.max(totalPages, 1)}
          </span>
          <div className="topbar-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page >= totalPages}
              onClick={() => onPage(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
