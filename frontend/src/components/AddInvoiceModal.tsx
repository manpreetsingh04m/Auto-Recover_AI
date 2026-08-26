"use client";

import { useState } from "react";
import type { FormEvent } from "react";

type Props = {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
};

const empty = {
  clientName: "",
  clientPhone: "",
  amount: "",
  status: "OVERDUE",
  daysOverdue: "7",
  paymentMethod: "CARD",
  cardExpiry: "",
  promiseToPayUntil: "",
  suspectedFraud: false,
};

export function AddInvoiceModal({ open, busy, onClose, onSubmit }: Props) {
  const [form, setForm] = useState(empty);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSubmit({
      clientName: form.clientName.trim(),
      clientPhone: form.clientPhone.trim() || null,
      amount: Number(form.amount),
      status: form.status,
      daysOverdue: Number(form.daysOverdue),
      paymentMethod: form.paymentMethod,
      cardExpiry:
        form.paymentMethod === "CARD" && form.cardExpiry
          ? new Date(form.cardExpiry).toISOString()
          : null,
      promiseToPayUntil: form.promiseToPayUntil
        ? new Date(form.promiseToPayUntil).toISOString()
        : null,
      suspectedFraud: form.suspectedFraud,
    });
    setForm(empty);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-head">
          <h2 style={{ margin: 0, fontSize: "1.05rem", color: "var(--rzp-navy)" }}>
            Add invoice
          </h2>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body form-grid">
            <div className="field full">
              <label htmlFor="clientName">Client name</label>
              <input
                id="clientName"
                required
                value={form.clientName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, clientName: e.target.value }))
                }
                placeholder="Company / Contact"
              />
            </div>
            <div className="field full">
              <label htmlFor="clientPhone">WhatsApp phone (E.164)</label>
              <input
                id="clientPhone"
                value={form.clientPhone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, clientPhone: e.target.value }))
                }
                placeholder="+9198XXXXXXXX"
              />
            </div>
            <div className="field">
              <label htmlFor="amount">Amount (INR)</label>
              <input
                id="amount"
                required
                type="number"
                min="1"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="daysOverdue">Days overdue</label>
              <input
                id="daysOverdue"
                required
                type="number"
                min="0"
                value={form.daysOverdue}
                onChange={(e) =>
                  setForm((f) => ({ ...f, daysOverdue: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select
                id="status"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="OVERDUE">OVERDUE</option>
                <option value="FAILED">FAILED</option>
                <option value="PENDING">PENDING</option>
                <option value="RECOVERED">RECOVERED</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="paymentMethod">Payment method</label>
              <select
                id="paymentMethod"
                value={form.paymentMethod}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    paymentMethod: e.target.value,
                    cardExpiry: e.target.value === "CARD" ? f.cardExpiry : "",
                  }))
                }
              >
                <option value="CARD">CARD</option>
                <option value="BANK_TRANSFER">BANK_TRANSFER</option>
              </select>
            </div>
            {form.paymentMethod === "CARD" && (
              <div className="field">
                <label htmlFor="cardExpiry">Card expiry</label>
                <input
                  id="cardExpiry"
                  type="date"
                  value={form.cardExpiry}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cardExpiry: e.target.value }))
                  }
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="promiseToPayUntil">Promise to pay until</label>
              <input
                id="promiseToPayUntil"
                type="date"
                value={form.promiseToPayUntil}
                onChange={(e) =>
                  setForm((f) => ({ ...f, promiseToPayUntil: e.target.value }))
                }
              />
            </div>
            <div className="field full">
              <label>
                <input
                  type="checkbox"
                  checked={form.suspectedFraud}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, suspectedFraud: e.target.checked }))
                  }
                />{" "}
                Suspected fraud
              </label>
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Create invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
