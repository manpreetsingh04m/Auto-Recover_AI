"use client";

import type { Metrics } from "@/lib/types";
import { formatINR, formatPct } from "@/lib/format";

type Props = {
  metrics: Metrics | null;
};

export function KpiStrip({ metrics }: Props) {
  const atRisk = metrics?.totalAtRisk || 0;
  const expected = metrics?.expectedRecovery || 0;
  const expectedPct = atRisk > 0 ? expected / atRisk : 0;

  const items = [
    {
      label: "Revenue at Risk",
      value: formatINR(atRisk),
      meta: `${metrics?.recoverableCount || 0} active cases`,
      accent: "#0d94fb",
    },
    {
      label: "Expected Recovery",
      value: formatINR(expected),
      meta: `${formatPct(expectedPct)} probability-weighted`,
      accent: "#3395ff",
    },
    {
      label: "Revenue Recovered",
      value: formatINR(metrics?.totalRecovered || 0),
      meta: "Marked RECOVERED in ledger",
      accent: "#0fa968",
    },
    {
      label: "Recovery Rate",
      value: formatPct(metrics?.successRate || 0),
      meta: `${metrics?.audit.success || 0} successful actions`,
      accent: "#0fa968",
    },
    {
      label: "AI Uplift",
      value: "+23.4%",
      meta: "vs manual outreach",
      accent: "#0d94fb",
    },
    {
      label: "Active Actions",
      value: String(metrics?.audit.success || 0),
      meta: "Across recovery channels",
      accent: "#e5484d",
    },
  ];

  return (
    <section className="kpi-grid kpi-grid-6">
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
