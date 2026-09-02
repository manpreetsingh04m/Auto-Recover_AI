"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { RecoveryQueueItem } from "@/lib/types";
import { formatINR, formatPct, shortAction } from "@/lib/format";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";

function riskLabel(score: number) {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

export default function RecoveryQueuePage() {
  const router = useRouter();
  const [queue, setQueue] = useState<RecoveryQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [executing, setExecuting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.recoveryQueue();
    setQueue(result.data);
  }, []);

  useEffect(() => {
    load()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [load]);

  async function handleExecute(invoiceId: string) {
    setExecuting(invoiceId);
    setError(null);
    try {
      await api.recoverInvoice(invoiceId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execute failed");
    } finally {
      setExecuting(null);
    }
  }

  const filtered = queue.filter((row) => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return (
      row.invoice.invoiceId.toLowerCase().includes(needle) ||
      row.invoice.clientName.toLowerCase().includes(needle) ||
      (row.invoice.clientPhone || "").includes(needle)
    );
  });

  return (
    <AuthGate>
      <AppShell>
        <main className="main">
          <header className="topbar">
            <div>
              <p className="section-kicker">AI recovery priority queue</p>
              <h1>Recovery queue</h1>
              <p>
                Accounts ordered by expected recovery value. Interventions execute the
                next-best AI action.
              </p>
            </div>
          </header>

          {error && <div className="toast error">{error}</div>}

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Priority queue</h2>
                <span>{filtered.length} recoverable accounts</span>
              </div>
              <input
                placeholder="Search customer or phone…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="queue-search"
              />
            </div>

            {loading ? (
              <div className="empty">Loading queue…</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Priority</th>
                      <th>Customer</th>
                      <th>Outstanding</th>
                      <th>Risk & factors</th>
                      <th>Rec %</th>
                      <th>Expected recovery</th>
                      <th>Next best action</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row, index) => (
                      <tr key={row.invoice._id}>
                        <td className="mono">#{index + 1}</td>
                        <td>
                          <strong>{row.invoice.clientName.split(" / ")[0]}</strong>
                          <div className="muted queue-sub">
                            {row.invoice.clientPhone || "—"} · DPD {row.invoice.daysOverdue}d
                          </div>
                        </td>
                        <td className="mono">{formatINR(row.invoice.amount)}</td>
                        <td>
                          <span className="pill warn">
                            {row.insights.riskScore}/100 ({riskLabel(row.insights.riskScore)})
                          </span>
                          <div className="muted queue-sub">{row.insights.rootCause}</div>
                        </td>
                        <td className="mono">{row.insights.recoveryProbability}%</td>
                        <td className="mono">{formatINR(row.insights.expectedRecoveryValue)}</td>
                        <td>
                          {shortAction(row.insights.recommendedAction)}
                          <div className="muted queue-sub">
                            Confidence {formatPct(row.insights.confidenceScore || 0)}
                          </div>
                        </td>
                        <td>
                          <div className="queue-actions">
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: "6px 10px", fontSize: "0.78rem" }}
                              disabled={executing === row.invoice.invoiceId}
                              onClick={() => handleExecute(row.invoice.invoiceId)}
                            >
                              {executing === row.invoice.invoiceId ? "…" : "Execute"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: "6px 10px", fontSize: "0.78rem" }}
                              onClick={() => router.push(`/agent?invoice=${row.invoice.invoiceId}`)}
                            >
                              Call
                            </button>
                            <Link
                              href={`/recovery/${row.invoice.invoiceId}`}
                              className="btn btn-secondary"
                              style={{ padding: "6px 10px", fontSize: "0.78rem" }}
                            >
                              View
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </AppShell>
    </AuthGate>
  );
}
