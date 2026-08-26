"use client";

import type { Metrics } from "@/lib/types";
import { formatINR, formatPct } from "@/lib/format";

type Props = {
  metrics: Metrics | null;
};

export function KpiStrip({ metrics }: Props) {
  const items = [
    {
      label: "Total At-Risk",
      value: formatINR(metrics?.totalAtRisk || 0),
      meta: `${metrics?.recoverableCount || 0} overdue / failed`,
      accent: "#0d94fb",
    },
    {
      label: "Total Recovered",
      value: formatINR(metrics?.totalRecovered || 0),
      meta: "Marked RECOVERED in ledger",
      accent: "#0fa968",
    },
    {
      label: "Active Interventions",
      value: String(metrics?.audit.success || 0),
      meta: "Successful AI actions logged",
      accent: "#3395ff",
    },
    {
      label: "Guardrail Blocks",
      value: String(metrics?.falsePositives || 0),
      meta: `${formatPct(metrics?.successRate || 0)} success rate`,
      accent: "#e5484d",
    },
  ];

  return (
    <section className="kpi-grid">
      {items.map((item) => (
        <article
          key={item.label}
          className="kpi"
          style={{ ["--accent" as string]: item.accent }}
        >
          <div className="kpi-label">{item.label}</div>
          <div className="kpi-value">{item.value}</div>
          <div className="kpi-meta">{item.meta}</div>
        </article>
      ))}
    </section>
  );
}
