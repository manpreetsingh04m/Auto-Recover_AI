"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { AuditLog, Invoice, RecoveryInsights } from "@/lib/types";
import { formatINR, formatPct, formatTime, recoveryBadge, shortAction } from "@/lib/format";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { VoiceCallScreen } from "@/components/VoiceCallScreen";

function clientDisplayName(name: string) {
  return name.split(" / ")[0].trim();
}

function extractPaymentLink(message: string | null | undefined) {
  if (!message) return null;
  const match = message.match(/https:\/\/rzp\.io\/[^\s]+/i);
  return match ? match[0] : null;
}

export default function RecoveryCasePage() {
  const params = useParams<{ invoiceId: string }>();
  const invoiceId = params.invoiceId;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [insights, setInsights] = useState<RecoveryInsights | null>(null);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [calling, setCalling] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [callScript, setCallScript] = useState<
    Array<{ speaker: "system" | "agent" | "customer"; text: string; delayMs: number }>
  >([]);
  const [toast, setToast] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await api.recoveryInsights(invoiceId);
    setInvoice(data.invoice);
    setInsights(data.insights);
    setAudits(data.audits);
    setLastMessage(data.insights.generatedMessage);
  }, [invoiceId]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) =>
        setToast({ type: "error", text: err.message || "Failed to load recovery case" })
      )
      .finally(() => setLoading(false));
  }, [load]);

  async function handleExecute() {
    setExecuting(true);
    setToast(null);
    try {
      const result = await api.recoverInvoice(invoiceId);
      setInvoice(result.invoice);
      setInsights(result.insights);
      setLastMessage(result.result.generatedMessage);
      setAudits((prev) => [
        {
          _id: result.result.auditId,
          invoiceId: result.result.invoiceId,
          timestamp: new Date().toISOString(),
          aiReasoning: result.insights.reasoning || "",
          executedAction: result.result.executedAction,
          confidenceScore: result.result.confidenceScore,
          recoveryProbability: result.result.recoveryProbability,
          status: result.result.status,
          generatedMessage: result.result.generatedMessage,
          rootCause: result.result.rootCause,
          guardrailReason: result.result.guardrailReason,
        },
        ...prev,
      ]);
      setToast({
        type: "ok",
        text: `Executed ${shortAction(result.result.executedAction)} — ${result.result.status === "SUCCESS" ? "action sent" : "blocked by guardrail"}.`,
      });
    } catch (err) {
      setToast({
        type: "error",
        text: err instanceof Error ? err.message : "Execution failed",
      });
    } finally {
      setExecuting(false);
    }
  }

  async function handleSimulatePayment() {
    setSimulating(true);
    setToast(null);
    try {
      const result = await api.simulatePayment(invoiceId);
      setInvoice(result.invoice);
      setToast({ type: "ok", text: result.message });
    } catch (err) {
      setToast({
        type: "error",
        text: err instanceof Error ? err.message : "Simulate payment failed",
      });
    } finally {
      setSimulating(false);
    }
  }

  async function handleVoiceCall() {
    setCalling(true);
    setToast(null);
    try {
      const result = await api.voiceCall(invoiceId);
      setInvoice(result.invoice);
      setCallScript(result.call.script);
      setCallOpen(true);
    } catch (err) {
      setToast({
        type: "error",
        text: err instanceof Error ? err.message : "Voice call failed",
      });
    } finally {
      setCalling(false);
    }
  }

  const recoverable = invoice && ["OVERDUE", "FAILED"].includes(invoice.status);
  const paymentLink = extractPaymentLink(lastMessage);
  const badge = recoveryBadge(insights?.recoveryProbability);

  return (
    <AuthGate>
      <AppShell>
        <main className="main">
          <header className="topbar">
            <div>
              <div className="breadcrumb">
                <Link href="/recovery">Recovery cases</Link>
                <span>/</span>
                <span>{invoiceId}</span>
              </div>
              <h1>AI recovery case</h1>
              <p>
                Review AI insights, execute the recommended action, and track audit history
                for this invoice.
              </p>
            </div>
            <div className="topbar-actions">
              <button type="button" className="btn btn-secondary" onClick={() => load()}>
                Refresh
              </button>
              <Link href="/" className="btn btn-secondary">
                Dashboard
              </Link>
            </div>
          </header>

          {toast && (
            <div className={`toast ${toast.type === "error" ? "error" : ""}`}>{toast.text}</div>
          )}

          {loading ? (
            <div className="panel">
              <div className="empty">Loading recovery intelligence…</div>
            </div>
          ) : !invoice || !insights ? (
            <div className="panel">
              <div className="empty">Case not found.</div>
            </div>
          ) : (
            <>
              <section className="recovery-hero-grid">
                <article className="recovery-profile panel">
                  <div className="recovery-profile-head">
                    <div className="recovery-avatar">
                      {clientDisplayName(invoice.clientName).charAt(0)}
                    </div>
                    <div>
                      <h2>{clientDisplayName(invoice.clientName)}</h2>
                      <p className="muted">{invoice.clientName}</p>
                    </div>
                  </div>
                  <div className="detail-grid">
                    <div className="detail-tile">
                      <span className="muted">Invoice</span>
                      <strong className="mono">{invoice.invoiceId}</strong>
                    </div>
                    <div className="detail-tile">
                      <span className="muted">Amount due</span>
                      <strong>{formatINR(invoice.amount)}</strong>
                    </div>
                    <div className="detail-tile">
                      <span className="muted">Days overdue</span>
                      <strong>{invoice.daysOverdue} days</strong>
                    </div>
                    <div className="detail-tile">
                      <span className="muted">Status</span>
                      <span
                        className={`pill ${
                          invoice.status === "RECOVERED"
                            ? "success"
                            : invoice.status === "FAILED"
                              ? "blocked"
                              : "warn"
                        }`}
                      >
                        {invoice.status}
                      </span>
                    </div>
                  </div>
                </article>

                <article className="panel recovery-scores">
                  <h2>Recovery intelligence</h2>
                  <div className="recovery-score-grid">
                    <div className="recovery-score-card risk">
                      <span>Risk score</span>
                      <strong>{insights.riskScore}</strong>
                      <small>Higher = harder to recover</small>
                    </div>
                    <div className="recovery-score-card prob">
                      <span>Recovery probability</span>
                      <strong>
                        {badge.emoji} {insights.recoveryProbability}%
                      </strong>
                      <small>AI-scored likelihood</small>
                    </div>
                    <div className="recovery-score-card value">
                      <span>Expected recovery value</span>
                      <strong>{formatINR(insights.expectedRecoveryValue)}</strong>
                      <small>Amount × probability</small>
                    </div>
                  </div>
                </article>
              </section>

              <section className="panel recovery-action-panel">
                <div className="panel-head">
                  <div>
                    <h2>AI recommendation</h2>
                    <span>
                      Confidence {formatPct(insights.confidenceScore || 0)} ·{" "}
                      {insights.source === "audit" ? "From last audit" : "Preview (not executed yet)"}
                    </span>
                  </div>
                  {recoverable && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleExecute}
                      disabled={executing}
                    >
                      {executing ? "Executing…" : "Execute recommendation"}
                    </button>
                  )}
                </div>

                <div className="recovery-rec-box">
                  <div className="recovery-rec-action">
                    {shortAction(insights.recommendedAction)}
                  </div>
                  <p className="recovery-root">{insights.rootCause}</p>
                  {insights.reasoning && (
                    <p className="muted recovery-reasoning">{insights.reasoning}</p>
                  )}
                </div>

                {lastMessage && (
                  <div className="recovery-message-box">
                    <h3>Outbound message</h3>
                    <pre>{lastMessage}</pre>
                    {paymentLink && (
                      <div className="recovery-link-row">
                        <a
                          href={paymentLink}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary"
                        >
                          Open Razorpay link
                        </a>
                        {recoverable && (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleSimulatePayment}
                            disabled={simulating}
                          >
                            {simulating ? "Processing…" : "Simulate payment"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="recovery-cta-row">
                  {recoverable && (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleVoiceCall}
                        disabled={calling}
                      >
                        {calling ? "Starting call…" : "Start AI voice call"}
                      </button>
                      {!paymentLink && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={handleSimulatePayment}
                          disabled={simulating}
                        >
                          {simulating ? "Processing…" : "Simulate payment"}
                        </button>
                      )}
                    </>
                  )}
                  {invoice.status === "RECOVERED" && (
                    <div className="recovery-success-banner">
                      Payment recovered — revenue captured in dashboard KPIs.
                    </div>
                  )}
                </div>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Audit trail</h2>
                    <span>Immutable ATS log for this case</span>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Action</th>
                        <th>Recovery</th>
                        <th>Status</th>
                        <th>Root cause</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audits.length === 0 ? (
                        <tr>
                          <td colSpan={5}>
                            <div className="empty">No audits yet — execute to log a decision.</div>
                          </td>
                        </tr>
                      ) : (
                        audits.map((log) => {
                          const rb = recoveryBadge(log.recoveryProbability);
                          return (
                            <tr key={log._id}>
                              <td className="muted">{formatTime(log.timestamp)}</td>
                              <td>{shortAction(log.executedAction)}</td>
                              <td>
                                {rb.emoji} {rb.label}
                              </td>
                              <td>
                                <span
                                  className={`pill ${
                                    log.status === "SUCCESS" ? "success" : "blocked"
                                  }`}
                                >
                                  {log.status}
                                </span>
                              </td>
                              <td className="muted">{log.rootCause || "—"}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </main>

        <VoiceCallScreen
          open={callOpen}
          clientName={clientDisplayName(invoice?.clientName || "Client")}
          invoiceId={invoice?.invoiceId || invoiceId}
          amount={invoice?.amount || 0}
          phone={invoice?.clientPhone}
          script={callScript}
          onClose={() => {
            setCallOpen(false);
            load().catch(() => undefined);
          }}
          onComplete={() => {
            setToast({
              type: "ok",
              text: "AI voice call completed — promise-to-pay captured.",
            });
          }}
        />
      </AppShell>
    </AuthGate>
  );
}
