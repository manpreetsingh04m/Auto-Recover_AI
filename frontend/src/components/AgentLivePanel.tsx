"use client";

import { useEffect, useRef, useState } from "react";
import type { CallScriptLine, Invoice, RecoveryInsights } from "@/lib/types";
import { formatINR } from "@/lib/format";
import { api } from "@/lib/api";

type Props = {
  invoice: Invoice | null;
  insights: RecoveryInsights | null;
};

function clientName(name: string) {
  return name.split(" / ")[0].trim();
}

export function AgentLivePanel({ invoice, insights }: Props) {
  const [phase, setPhase] = useState<"idle" | "ringing" | "live" | "done">("idle");
  const [script, setScript] = useState<CallScriptLine[]>([]);
  const [visibleLines, setVisibleLines] = useState<CallScriptLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPhase("idle");
    setScript([]);
    setVisibleLines([]);
    setError(null);
  }, [invoice?.invoiceId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [visibleLines]);

  useEffect(() => {
    if (phase !== "live" || script.length === 0) return;

    let cancelled = false;
    let index = 0;
    let timeoutId = 0;

    function playNext() {
      if (cancelled || index >= script.length) {
        if (!cancelled) setPhase("done");
        return;
      }
      const line = script[index];
      index += 1;
      setVisibleLines((prev) => [...prev, line]);
      timeoutId = window.setTimeout(playNext, line.delayMs);
    }

    timeoutId = window.setTimeout(playNext, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [phase, script]);

  async function startCall() {
    if (!invoice) return;
    setBusy(true);
    setError(null);
    setVisibleLines([]);
    setPhase("ringing");
    try {
      const result = await api.voiceCall(invoice.invoiceId);
      setScript(result.call.script);
      window.setTimeout(() => setPhase("live"), 1800);
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Call failed");
    } finally {
      setBusy(false);
    }
  }

  function disconnect() {
    setPhase("idle");
    setVisibleLines([]);
    setScript([]);
  }

  if (!invoice || !insights) {
    return (
      <div className="agent-live-panel empty">
        Select a customer from the queue to start the live voice agent.
      </div>
    );
  }

  const name = clientName(invoice.clientName);
  const connected = phase === "live" || phase === "done";

  return (
    <div className="agent-live-panel">
      <div className="agent-live-head">
        <strong>Live voice call session</strong>
        <span className={connected ? "pill success" : "pill blocked"}>
          {phase === "idle" ? "Disconnected" : phase === "ringing" ? "Connecting…" : "Connected"}
        </span>
      </div>

      {connected && (
        <div className="agent-audio-bar">
          <span>Streaming audio (simulated)</span>
          <span className="agent-wave">
            <i /><i /><i /><i />
          </span>
        </div>
      )}

      <div className="agent-transcript" ref={scrollRef}>
        {phase === "idle" && (
          <p className="muted">
            Press &quot;Start live voice call&quot; to begin the AI recovery conversation for{" "}
            {name}.
          </p>
        )}
        {phase === "ringing" && <p className="muted">Dialling {name}…</p>}
        {visibleLines.map((line, i) => (
          <div key={`${line.speaker}-${i}`} className={`agent-line agent-line-${line.speaker}`}>
            <span>{line.speaker === "agent" ? "Razorpay Revive AI" : line.speaker === "customer" ? name : "System"}</span>
            <p>{line.text}</p>
          </div>
        ))}
        {phase === "live" && <p className="muted">Speaking…</p>}
        {phase === "done" && (
          <p className="agent-outcome">Promise-to-pay captured · Follow-up scheduled</p>
        )}
      </div>

      {error && <div className="toast error">{error}</div>}

      <div className="agent-live-actions">
        {phase === "idle" || phase === "done" ? (
          <button type="button" className="btn btn-primary" onClick={startCall} disabled={busy}>
            {busy ? "Starting…" : "Start live voice call"}
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={disconnect}>
            Disconnect call
          </button>
        )}
      </div>
    </div>
  );
}

export function AgentBriefPanel({
  invoice,
  insights,
}: {
  invoice: Invoice | null;
  insights: RecoveryInsights | null;
}) {
  if (!invoice || !insights) {
    return (
      <div className="agent-brief-panel empty">Pre-call AI brief will appear here.</div>
    );
  }

  const name = clientName(invoice.clientName);
  const riskLabel =
    insights.riskScore >= 70 ? "HIGH" : insights.riskScore >= 40 ? "MEDIUM" : "LOW";

  return (
    <div className="agent-brief-panel">
      <div className="agent-brief-head">
        <strong>Pre-call AI brief</strong>
        <span className="pill neutral">Live ready</span>
      </div>
      <h3>{name}</h3>
      <p className="muted">
        Outstanding: {formatINR(invoice.amount)} · DPD: {invoice.daysOverdue} days
      </p>
      <div className="agent-brief-scores">
        <div className="detail-tile">
          <span className="muted">Risk score</span>
          <strong>
            {insights.riskScore}/100 ({riskLabel})
          </strong>
        </div>
        <div className="detail-tile">
          <span className="muted">Rec probability</span>
          <strong>{insights.recoveryProbability}%</strong>
        </div>
      </div>
      <div className="agent-objective">
        <strong>Recommended objective</strong>
        <ul>
          <li>Confirm commitment for full or partial payment</li>
          <li>Issue instant Razorpay payment link via WhatsApp</li>
        </ul>
        <p className="muted">{insights.rootCause}</p>
      </div>
    </div>
  );
}
