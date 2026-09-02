"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RecoveryQueueItem } from "@/lib/types";
import { formatINR } from "@/lib/format";

function clientLabel(name: string) {
  return name.split(" / ")[0].trim() || name;
}

function optionMeta(row: RecoveryQueueItem) {
  const { invoice } = row;
  return {
    client: clientLabel(invoice.clientName),
    meta: `${invoice.invoiceId} · ${formatINR(invoice.amount)} · ${invoice.daysOverdue}d overdue`,
  };
}

export function AgentInvoicePicker({
  queue,
  value,
  onChange,
  disabled,
}: {
  queue: RecoveryQueueItem[];
  value: string;
  onChange: (invoiceId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const seen = new Set<string>();
    return queue.filter((row) => {
      if (seen.has(row.invoice.invoiceId)) return false;
      seen.add(row.invoice.invoiceId);
      return true;
    });
  }, [queue]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((row) => {
      const inv = row.invoice;
      return (
        inv.invoiceId.toLowerCase().includes(needle) ||
        inv.clientName.toLowerCase().includes(needle) ||
        String(inv.amount).includes(needle)
      );
    });
  }, [items, query]);

  const selected = items.find((row) => row.invoice.invoiceId === value) || null;

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div className={`agent-picker${open ? " open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="agent-picker-trigger"
        disabled={disabled || items.length === 0}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {selected ? (
          <span className="agent-picker-trigger-copy">
            <span className="agent-picker-primary">{optionMeta(selected).client}</span>
            <span className="agent-picker-secondary">{optionMeta(selected).meta}</span>
          </span>
        ) : (
          <span className="agent-picker-placeholder">Select account…</span>
        )}
        <svg
          className="agent-picker-chevron"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="agent-picker-menu">
          <div className="agent-picker-search-wrap">
            <input
              type="search"
              className="agent-picker-search"
              placeholder="Search client or invoice…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
          </div>
          <ul className="agent-picker-list" role="listbox">
            {filtered.length === 0 ? (
              <li className="agent-picker-empty">No matching accounts</li>
            ) : (
              filtered.map((row) => {
                const { client, meta } = optionMeta(row);
                const active = row.invoice.invoiceId === value;
                return (
                  <li key={row.invoice.invoiceId}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`agent-picker-option${active ? " active" : ""}`}
                      onClick={() => {
                        onChange(row.invoice.invoiceId);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <span className="agent-picker-option-copy">
                        <span className="agent-picker-option-primary">{client}</span>
                        <span className="agent-picker-option-secondary">{meta}</span>
                      </span>
                      {active && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M5 12l4 4L19 7"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
