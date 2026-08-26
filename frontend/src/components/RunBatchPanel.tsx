"use client";

import type { Metrics } from "@/lib/types";
import { shortAction } from "@/lib/format";

type Props = {
  metrics: Metrics | null;
  running: boolean;
  onRun: () => void;
};

export function RunBatchPanel({ metrics, running, onRun }: Props) {
  const actions = Object.entries(metrics?.actionsByType || {});
  const max = Math.max(1, ...actions.map(([, n]) => n));

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Recovery Engine</h2>
          <span>Batch process all FAILED / OVERDUE invoices</span>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onRun}
          disabled={running}
        >
          {running ? "Running batch…" : "Run AI Batch"}
        </button>
      </div>
      <div className="panel-body">
        <div className="batch-stats">
          <div className="batch-stat">
            <strong>{metrics?.audit.total || 0}</strong>
            <span className="muted">Audit events</span>
          </div>
          <div className="batch-stat">
            <strong>{metrics?.audit.success || 0}</strong>
            <span className="muted">Executed</span>
          </div>
          <div className="batch-stat">
            <strong>{metrics?.audit.blocked || 0}</strong>
            <span className="muted">Blocked</span>
          </div>
        </div>

        <div className="action-bars">
          {actions.length === 0 ? (
            <div className="empty">No AI actions yet — run a batch to populate.</div>
          ) : (
            actions.map(([action, count]) => (
              <div className="action-row" key={action}>
                <span>{shortAction(action)}</span>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                </div>
                <strong className="mono">{count}</strong>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
