export function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export function formatPct(rate: number) {
  return `${((rate || 0) * 100).toFixed(1)}%`;
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function shortAction(action: string) {
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function recoveryBadge(probability: number | null | undefined) {
  if (probability == null || Number.isNaN(probability)) {
    return { emoji: "—", label: "—", className: "recovery-unknown" };
  }
  const value = Math.round(probability);
  if (value > 80) {
    return { emoji: "🟢", label: `${value}%`, className: "recovery-high" };
  }
  if (value >= 50) {
    return { emoji: "🟡", label: `${value}%`, className: "recovery-mid" };
  }
  return { emoji: "🔴", label: `${value}%`, className: "recovery-low" };
}
