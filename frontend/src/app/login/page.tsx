"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { setSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("merchant@autorecover.ai");
  const [password, setPassword] = useState("Recover@123");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.login(email.trim(), password);
      setSession(result.token, result.user);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="brand" style={{ marginBottom: 18 }}>
          <div className="brand-mark">AR</div>
          <div className="brand-copy">
            <strong style={{ color: "var(--rzp-navy)" }}>Auto-Recover</strong>
            <span style={{ color: "var(--rzp-muted)" }}>Merchant sign in</span>
          </div>
        </div>
        <h1>Welcome back</h1>
        <p className="muted">
          JWT-protected console for AI revenue recovery.
        </p>
        {error && <div className="toast error">{error}</div>}
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: "100%", marginTop: 18 }}
          disabled={busy}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="muted" style={{ marginTop: 14, fontSize: "0.8rem" }}>
          Demo: merchant@autorecover.ai / Recover@123
        </p>
      </form>
    </div>
  );
}
