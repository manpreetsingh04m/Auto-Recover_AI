"use client";

import { useEffect, useRef, useState } from "react";
import type { CallScriptLine } from "@/lib/types";
import { formatINR } from "@/lib/format";

type Props = {
  open: boolean;
  clientName: string;
  invoiceId: string;
  amount: number;
  phone?: string | null;
  script: CallScriptLine[];
  onClose: () => void;
  onComplete?: () => void;
};

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function VoiceCallScreen({
  open,
  clientName,
  invoiceId,
  amount,
  phone,
  script,
  onClose,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<"ringing" | "live" | "done">("ringing");
  const [visibleLines, setVisibleLines] = useState<CallScriptLine[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setPhase("ringing");
      setVisibleLines([]);
      setElapsed(0);
      completedRef.current = false;
      return;
    }

    const ringTimer = window.setTimeout(() => setPhase("live"), 2200);
    return () => window.clearTimeout(ringTimer);
  }, [open]);

  useEffect(() => {
    if (!open || phase !== "live") return;

    const timer = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [open, phase]);

  useEffect(() => {
    if (!open || phase !== "live" || script.length === 0) return;

    let cancelled = false;
    let index = 0;
    let timeoutId = 0;

    function playNext() {
      if (cancelled || index >= script.length) {
        if (!cancelled) {
          setPhase("done");
          if (!completedRef.current) {
            completedRef.current = true;
            onComplete?.();
          }
        }
        return;
      }

      const line = script[index];
      index += 1;
      setVisibleLines((prev) => [...prev, line]);
      timeoutId = window.setTimeout(playNext, line.delayMs);
    }

    timeoutId = window.setTimeout(playNext, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [open, phase, script, onComplete]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [visibleLines]);

  if (!open) return null;

  return (
    <div className="voice-overlay" role="dialog" aria-modal="true">
      <div className="voice-shell">
        <header className="voice-header">
          <div className="voice-status-pill">
            <span className={`voice-pulse ${phase === "ringing" ? "ringing" : ""}`} />
            {phase === "ringing"
              ? "Dialling…"
              : phase === "live"
                ? "AI voice call in progress"
                : "Call completed"}
          </div>
          <button type="button" className="voice-close" onClick={onClose}>
            End call
          </button>
        </header>

        <div className="voice-hero">
          <div className="voice-avatar">{clientName.charAt(0).toUpperCase()}</div>
          <h2>{clientName}</h2>
          <p className="voice-meta">
            {invoiceId} · {formatINR(amount)}
            {phone ? ` · ${phone}` : ""}
          </p>
          <div className="voice-timer">{formatDuration(elapsed)}</div>
        </div>

        {phase === "ringing" && (
          <div className="voice-ringing">
            <div className="voice-ring-wave" />
            <div className="voice-ring-wave delay" />
            <p>Connecting Razorpay Revive AI voice agent via Bland.ai…</p>
          </div>
        )}

        {(phase === "live" || phase === "done") && (
          <div className="voice-transcript" ref={scrollRef}>
            {visibleLines.map((line, i) => (
              <div
                key={`${line.speaker}-${i}`}
                className={`voice-line voice-line-${line.speaker}`}
              >
                <span className="voice-speaker">
                  {line.speaker === "agent"
                    ? "Razorpay Revive AI"
                    : line.speaker === "customer"
                      ? clientName.split(" ")[0]
                      : "System"}
                </span>
                <p>{line.text}</p>
              </div>
            ))}
            {phase === "live" && <div className="voice-typing">Speaking…</div>}
          </div>
        )}

        {phase === "done" && (
          <footer className="voice-footer">
            <div className="voice-outcome">
              Promise-to-pay captured · Follow-up scheduled · Audit logged
            </div>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Return to case
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
