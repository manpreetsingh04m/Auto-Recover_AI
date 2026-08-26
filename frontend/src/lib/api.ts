import type { AuditLog, BatchResult, Invoice, Metrics, Paginated } from "./types";
import { clearSession, getToken } from "./auth";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000").replace(
  /\/$/,
  ""
);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const url = `${API_URL}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new Error(
      `Cannot reach API at ${API_URL}. Is the backend running? (cd backend && npm run dev)`
    );
  }

  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    clearSession();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Session expired — please sign in again");
  }
  if (!res.ok) {
    throw new Error(body.error || body.detail || `Request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{
      ok: boolean;
      token: string;
      user: { id: string; name: string; email: string; role: string };
    }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () =>
    request<{
      ok: boolean;
      user: { id: string; name: string; email: string; role: string };
    }>("/api/auth/me"),
  metrics: () => request<Metrics>("/api/metrics"),
  auditLogs: (page = 1, limit = 15, status?: string) => {
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (status) qs.set("status", status);
    return request<Paginated<AuditLog>>(`/api/audit-logs?${qs}`);
  },
  invoices: (page = 1, limit = 20, status?: string, q?: string) => {
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (status) qs.set("status", status);
    if (q) qs.set("q", q);
    return request<Paginated<Invoice>>(`/api/invoices?${qs}`);
  },
  invoiceDetail: (invoiceId: string) =>
    request<{ ok: boolean; invoice: Invoice; audits: AuditLog[] }>(
      `/api/invoices/${encodeURIComponent(invoiceId)}`
    ),
  createInvoice: (payload: Record<string, unknown>) =>
    request<{ ok: boolean; invoice: Invoice }>("/api/invoices", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  runBatch: () =>
    request<BatchResult>("/api/run-batch", {
      method: "POST",
    }),
};
