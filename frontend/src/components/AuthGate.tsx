"use client";

import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setRedirecting(true);
      window.location.replace("/login");
      return;
    }
    setReady(true);
  }, []);

  if (ready) {
    return <>{children}</>;
  }

  return (
    <div className="login-shell">
      <div className="muted">
        {redirecting ? "Redirecting to sign in…" : "Checking session…"}
      </div>
    </div>
  );
}
