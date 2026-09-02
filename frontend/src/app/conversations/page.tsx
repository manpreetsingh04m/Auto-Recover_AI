"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ConversationItem } from "@/lib/types";
import { formatINR, formatTime } from "@/lib/format";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";

function statusClass(status?: string) {
  if (status === "Resolved") return "success";
  if (status === "Negotiated") return "warn";
  return "neutral";
}

export default function ConversationsPage() {
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .conversations()
      .then((result) => setItems(result.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthGate>
      <AppShell>
        <main className="main">
          <header className="topbar">
            <div>
              <p className="section-kicker">Call transcripts & history</p>
              <h1>Conversations & transcripts</h1>
              <p>
                Complete call outcomes, intent extraction, commitment verification, and
                recovery history.
              </p>
            </div>
          </header>

          {error && <div className="toast error">{error}</div>}

          <section className="panel">
            {loading ? (
              <div className="empty">Loading conversations…</div>
            ) : items.length === 0 ? (
              <div className="empty">
                No voice conversations yet. Start a call from the{" "}
                <Link href="/agent">AI Agent</Link> page.
              </div>
            ) : (
              <div className="conversation-list">
                {items.map((item, index) => (
                  <article key={`${item.invoiceId}-${item.at}-${index}`} className="conversation-row">
                    <div>
                      <div className="conversation-head">
                        <strong>{item.clientName.split(" / ")[0]}</strong>
                        <span className={`pill ${statusClass(item.status)}`}>
                          {item.status || "Logged"}
                        </span>
                      </div>
                      <p className="muted">{item.note}</p>
                      <span className="muted conversation-meta">
                        {item.invoiceId} · {formatTime(item.at)}
                      </span>
                    </div>
                    <div className="conversation-side">
                      <strong>{formatINR(item.amount)}</strong>
                      <Link href={`/recovery/${item.invoiceId}`} className="btn btn-secondary">
                        View case
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>
      </AppShell>
    </AuthGate>
  );
}
