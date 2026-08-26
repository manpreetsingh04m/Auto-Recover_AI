"use client";

import type { AuditLog, Invoice } from "@/lib/types";
import { formatINR, formatTime, shortAction } from "@/lib/format";

type Props = {
  invoice: Invoice | null;
  audits: AuditLog[];
  loading?: boolean;
  onClose: () => void;
};

function statusClass(status: string) {
  if (status === "RECOVERED") return "success";
  if (status === "FAILED") return "blocked";
  if (status === "OVERDUE") return "warn";
  return "neutral";
}

export function InvoiceDetailModal({ invoice, audits, loading, onClose }: Props) {
  if (!invoice && !loading) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal detail-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Invoice details"
      >
        <div className="modal-head">
          <div>
            <h2 style={{ margin: 0, fontSize: "1.1rem", color: "var(--rzp-navy)" }}>
              {loading ? "Loading…" : invoice?.invoiceId}
            </h2>
            {!loading && invoice && (
              <span className="muted" style={{ fontSize: "0.82rem" }}>
                {invoice.clientName}
              </span>
            )}
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {loading || !invoice ? (
          <div className="modal-body">
            <div className="empty">Fetching invoice details…</div>
          </div>
        ) : (
          <div className="modal-body detail-scroll">
            <div className="detail-hero">
              <div>
                <div className="muted">Amount</div>
                <div className="detail-amount mono">{formatINR(invoice.amount)}</div>
              </div>
              <span className={`pill ${statusClass(invoice.status)}`}>
                {invoice.status}
              </span>
            </div>

            <div className="detail-grid">
              <div className="detail-tile">
                <span className="muted">WhatsApp phone</span>
                <strong>{invoice.clientPhone || "Not set"}</strong>
              </div>
              <div className="detail-tile">
                <span className="muted">Days overdue</span>
                <strong className="mono">{invoice.daysOverdue}d</strong>
              </div>
              <div className="detail-tile">
                <span className="muted">Payment method</span>
                <strong>{invoice.paymentMethod.replace("_", " ")}</strong>
              </div>
              <div className="detail-tile">
                <span className="muted">Retry count</span>
                <strong className="mono">{invoice.retryCount}</strong>
              </div>
              <div className="detail-tile">
                <span className="muted">Suspected fraud</span>
                <strong>{invoice.suspectedFraud ? "Yes" : "No"}</strong>
              </div>
              <div className="detail-tile">
                <span className="muted">Promise to pay</span>
                <strong>
                  {invoice.promiseToPayUntil
                    ? formatTime(invoice.promiseToPayUntil)
                    : "—"}
                </strong>
              </div>
              {invoice.paymentMethod === "CARD" && (
                <div className="detail-tile">
                  <span className="muted">Card expiry</span>
                  <strong>
                    {invoice.cardExpiry ? formatTime(invoice.cardExpiry) : "—"}
                  </strong>
                </div>
              )}
              <div className="detail-tile">
                <span className="muted">Currency</span>
                <strong>{invoice.currency || "INR"}</strong>
              </div>
            </div>

            <div className="detail-section">
              <h3>Interaction history</h3>
              {(invoice.history || []).length === 0 ? (
                <div className="empty">No history yet.</div>
              ) : (
                <ul className="detail-timeline">
                  {(invoice.history || []).map((h, idx) => (
                    <li key={`${h.at}-${idx}`}>
                      <div className="timeline-dot" />
                      <div>
                        <strong>
                          {h.channel} · {h.actor}
                        </strong>
                        <p>{h.note}</p>
                        <span className="muted">{formatTime(h.at)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="detail-section">
              <h3>Recent AI audits</h3>
              {audits.length === 0 ? (
                <div className="empty">No AI actions on this invoice yet.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Action</th>
                        <th>Conf.</th>
                        <th>Status</th>
                        <th>Reasoning</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audits.map((a) => (
                        <tr key={a._id}>
                          <td className="muted">{formatTime(a.timestamp)}</td>
                          <td>
                            <span className="pill action">
                              {shortAction(a.executedAction)}
                            </span>
                          </td>
                          <td className="mono">
                            {a.confidenceScore?.toFixed(2) ?? "—"}
                          </td>
                          <td>
                            <span
                              className={`pill ${
                                a.status === "SUCCESS" ? "success" : "blocked"
                              }`}
                            >
                              {a.status === "SUCCESS" ? "SUCCESS" : "BLOCKED"}
                            </span>
                          </td>
                          <td className="reason">
                            {a.rootCause || a.aiReasoning}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
