"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import type { AuditLog, Invoice, Metrics } from "@/lib/types";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { KpiStrip } from "@/components/KpiStrip";
import { RunBatchPanel } from "@/components/RunBatchPanel";
import { AuditTable } from "@/components/AuditTable";
import { InvoicePanel } from "@/components/InvoicePanel";
import { AddInvoiceModal } from "@/components/AddInvoiceModal";

function DashboardInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const showAuditOnly = searchParams.get("tab") === "audit";

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState("");
  const [running, setRunning] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "error"; text: string } | null>(
    null
  );

  const refresh = useCallback(async () => {
    const [m, audit, inv] = await Promise.all([
      api.metrics(),
      api.auditLogs(page, 12, filter || undefined),
      api.invoices(1, 8),
    ]);
    setMetrics(m);
    setLogs(audit.data);
    setTotalPages(audit.totalPages || 1);
    setInvoices(inv.data);
  }, [page, filter]);

  useEffect(() => {
    refresh().catch((err) =>
      setToast({ type: "error", text: err.message || "Failed to load dashboard" })
    );
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => {
      refresh().catch(() => undefined);
    }, 12000);
    return () => clearInterval(id);
  }, [refresh]);

  async function handleRunBatch() {
    setRunning(true);
    setToast(null);
    try {
      const result = await api.runBatch();
      setToast({
        type: "ok",
        text: `Batch complete — ${result.summary.success} executed, ${result.summary.blocked} blocked across ${result.summary.processed} invoices.`,
      });
      setPage(1);
      await refresh();
      router.replace("/?tab=audit");
    } catch (err) {
      setToast({
        type: "error",
        text: err instanceof Error ? err.message : "Batch failed",
      });
    } finally {
      setRunning(false);
    }
  }

  async function handleCreateInvoice(payload: Record<string, unknown>) {
    setSaving(true);
    try {
      await api.createInvoice(payload);
      setModalOpen(false);
      setToast({ type: "ok", text: "Invoice added to the recovery ledger." });
      await refresh();
    } catch (err) {
      setToast({
        type: "error",
        text: err instanceof Error ? err.message : "Could not create invoice",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <main className="main">
        <header className="topbar">
          <div>
            <h1>
              {showAuditOnly
                ? "AI decision audit"
                : "Merchant recovery dashboard"}
            </h1>
            <p>
              Detect overdue and failed B2B payments, diagnose with AI, and execute
              only bounded recovery actions.
            </p>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => refresh()}
            >
              Refresh
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRunBatch}
              disabled={running}
            >
              {running ? "Running…" : "Run AI Batch"}
            </button>
          </div>
        </header>

        {toast && (
          <div className={`toast ${toast.type === "error" ? "error" : ""}`}>
            {toast.text}
          </div>
        )}

        {!showAuditOnly && (
          <>
            <KpiStrip metrics={metrics} />
            <div className="panel-grid">
              <RunBatchPanel
                metrics={metrics}
                running={running}
                onRun={handleRunBatch}
              />
              <InvoicePanel
                invoices={invoices}
                onAdd={() => setModalOpen(true)}
              />
            </div>
          </>
        )}

        <div id="audit">
          <AuditTable
            logs={logs}
            page={page}
            totalPages={totalPages}
            filter={filter}
            onFilter={(value) => {
              setFilter(value);
              setPage(1);
            }}
            onPage={setPage}
          />
        </div>
      </main>

      <AddInvoiceModal
        open={modalOpen}
        busy={saving}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreateInvoice}
      />
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <AuthGate>
      <Suspense
        fallback={
          <div className="login-shell">
            <div className="muted">Loading dashboard…</div>
          </div>
        }
      >
        <DashboardInner />
      </Suspense>
    </AuthGate>
  );
}
