"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AuditLog, Invoice } from "@/lib/types";
import { formatINR } from "@/lib/format";
import { AuthGate } from "@/components/AuthGate";
import { Sidebar } from "@/components/Sidebar";
import { AddInvoiceModal } from "@/components/AddInvoiceModal";
import { InvoiceDetailModal } from "@/components/InvoiceDetailModal";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.invoices(page, 15, status || undefined, q || undefined);
    setInvoices(result.data);
    setTotalPages(result.totalPages || 1);
    setTotal(result.total);
  }, [page, status, q]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  async function openDetail(invoiceId: string) {
    setDetailLoading(true);
    setSelected(null);
    setAudits([]);
    try {
      const detail = await api.invoiceDetail(invoiceId);
      setSelected(detail.invoice);
      setAudits(detail.audits);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice");
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelected(null);
    setAudits([]);
    setDetailLoading(false);
  }

  async function handleCreate(payload: Record<string, unknown>) {
    setSaving(true);
    try {
      await api.createInvoice(payload);
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthGate>
      <div className="app-shell">
        <Sidebar />
        <main className="main">
          <header className="topbar">
            <div>
              <h1>Invoice ledger</h1>
              <p>
                Full receivable book — click any row for a floating detail popup
                with history and AI audits.
              </p>
            </div>
            <div className="topbar-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setModalOpen(true)}
              >
                Add invoice
              </button>
            </div>
          </header>

          {error && <div className="toast error">{error}</div>}

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>All invoices</h2>
                <span>{total} records</span>
              </div>
              <div className="filters" style={{ alignItems: "center" }}>
                <input
                  placeholder="Search ID / client / phone"
                  value={q}
                  onChange={(e) => {
                    setPage(1);
                    setQ(e.target.value);
                  }}
                  style={{
                    border: "1px solid var(--rzp-line)",
                    borderRadius: 10,
                    padding: "8px 12px",
                    minWidth: 220,
                  }}
                />
                {["", "OVERDUE", "FAILED", "PENDING", "RECOVERED"].map((s) => (
                  <button
                    key={s || "all"}
                    type="button"
                    className={`chip ${status === s ? "active" : ""}`}
                    onClick={() => {
                      setStatus(s);
                      setPage(1);
                    }}
                  >
                    {s || "All"}
                  </button>
                ))}
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Client</th>
                    <th>Phone</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Overdue</th>
                    <th>Method</th>
                    <th>Retries</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv._id}
                      className="invoice-row"
                      onClick={() => openDetail(inv.invoiceId)}
                    >
                      <td className="mono">{inv.invoiceId}</td>
                      <td>{inv.clientName}</td>
                      <td className="muted">{inv.clientPhone || "—"}</td>
                      <td className="mono">{formatINR(inv.amount)}</td>
                      <td>
                        <span
                          className={`pill ${
                            inv.status === "RECOVERED"
                              ? "success"
                              : inv.status === "FAILED"
                                ? "blocked"
                                : inv.status === "OVERDUE"
                                  ? "warn"
                                  : "neutral"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="mono">{inv.daysOverdue}d</td>
                      <td className="muted">
                        {inv.paymentMethod.replace("_", " ")}
                      </td>
                      <td className="mono">{inv.retryCount}</td>
                      <td>
                        {inv.suspectedFraud ? (
                          <span className="pill blocked">FRAUD</span>
                        ) : inv.promiseToPayUntil ? (
                          <span className="pill warn">PTP</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
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
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </section>
        </main>

        <InvoiceDetailModal
          invoice={selected}
          audits={audits}
          loading={detailLoading}
          onClose={closeDetail}
        />

        <AddInvoiceModal
          open={modalOpen}
          busy={saving}
          onClose={() => setModalOpen(false)}
          onSubmit={handleCreate}
        />
      </div>
    </AuthGate>
  );
}
