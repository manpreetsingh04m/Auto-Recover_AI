"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import type { RecoveryQueueItem } from "@/lib/types";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { AgentBriefPanel, AgentLivePanel } from "@/components/AgentLivePanel";
import { AgentInvoicePicker } from "@/components/AgentInvoicePicker";

function AgentPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [queue, setQueue] = useState<RecoveryQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .recoveryQueue()
      .then((result) => {
        setQueue(result.data);
        const fromUrl = searchParams.get("invoice");
        if (fromUrl && result.data.some((row) => row.invoice.invoiceId === fromUrl)) {
          setSelectedId(fromUrl);
        } else if (result.data[0]) {
          setSelectedId(result.data[0].invoice.invoiceId);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [searchParams]);

  const selected = queue.find((row) => row.invoice.invoiceId === selectedId) || null;

  return (
    <AppShell>
      <main className="main">
        <header className="topbar">
          <div>
            <p className="section-kicker">Razorpay Revive AI voice agent & real-time intelligence</p>
            <h1>Live voice agent</h1>
            <p>
              Autonomous voice recovery with live transcript, promise-to-pay capture, and
              audit logging.
            </p>
          </div>
          <div className="topbar-actions">
            <AgentInvoicePicker
              queue={queue}
              value={selectedId}
              disabled={loading || queue.length === 0}
              onChange={(invoiceId) => {
                setSelectedId(invoiceId);
                router.replace(`/agent?invoice=${invoiceId}`);
              }}
            />
          </div>
        </header>

        {error && <div className="toast error">{error}</div>}

        {loading ? (
          <div className="panel empty">Loading agent workspace…</div>
        ) : (
          <div className="agent-split-grid">
            <AgentBriefPanel invoice={selected?.invoice || null} insights={selected?.insights || null} />
            <AgentLivePanel invoice={selected?.invoice || null} insights={selected?.insights || null} />
          </div>
        )}
      </main>
    </AppShell>
  );
}

export default function AgentPage() {
  return (
    <AuthGate>
      <Suspense fallback={<div className="login-shell muted">Loading agent…</div>}>
        <AgentPageInner />
      </Suspense>
    </AuthGate>
  );
}
