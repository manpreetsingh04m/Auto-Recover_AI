"use client";

import Link from "next/link";
import type { Invoice } from "@/lib/types";
import { formatINR } from "@/lib/format";

type Props = {
  invoices: Invoice[];
  onAdd: () => void;
};

export function InvoicePanel({ invoices, onAdd }: Props) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Invoices</h2>
          <span>Recent ledger rows · <Link href="/invoices">View all</Link></span>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onAdd}>
          Add invoice
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Client</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Overdue</th>
              <th>Method</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty">No invoices yet.</div>
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv._id}>
                  <td className="mono">
                    <Link href={`/invoices`}>{inv.invoiceId}</Link>
                  </td>
                  <td>{inv.clientName}</td>
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
                  <td className="muted">{inv.paymentMethod.replace("_", " ")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
