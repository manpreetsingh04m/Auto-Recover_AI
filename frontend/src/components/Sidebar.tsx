"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { clearSession, getUser } from "@/lib/auth";

function OverviewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10.5V20h6v-9.5H4Zm10 0V20h6v-9.5h-6ZM4 4v4.5h16V4H4Z"
        fill="currentColor"
      />
    </svg>
  );
}

function InvoicesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 3h8l4 4v14H7V3Zm8 1.5V8h3.5L15 4.5ZM9 11h8v1.5H9V11Zm0 4h8v1.5H9V15Zm0 4h5V20.5H9V19Z"
        fill="currentColor"
      />
    </svg>
  );
}

function AuditIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 1.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Zm-.75 3h1.5v5.25l3.5 2.1-.75 1.25L11.25 13V7.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 1.5c-3.3 0-6 2.1-6 4.75V20h12v-1.75c0-2.65-2.7-4.75-6-4.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SidebarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const user = getUser();
  const tab = searchParams.get("tab");

  function logout() {
    clearSession();
    router.replace("/login");
  }

  const items = [
    {
      href: "/",
      label: "Overview",
      hint: "KPIs & recovery",
      icon: <OverviewIcon />,
      active: pathname === "/" && tab !== "audit",
    },
    {
      href: "/invoices",
      label: "Invoices",
      hint: "Full ledger",
      icon: <InvoicesIcon />,
      active: pathname.startsWith("/invoices"),
    },
    {
      href: "/?tab=audit",
      label: "AI Audit Trail",
      hint: "ATS decisions log",
      icon: <AuditIcon />,
      active: pathname === "/" && tab === "audit",
    },
    {
      href: "/profile",
      label: "Profile",
      hint: "Merchant details",
      icon: <ProfileIcon />,
      active: pathname.startsWith("/profile"),
    },
  ];

  const initial = (user?.name || user?.email || "M").charAt(0).toUpperCase();
  const displayName = user?.businessName || user?.name || "Merchant";

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="brand">
          <div className="brand-mark">AR</div>
          <div className="brand-copy">
            <strong>Auto-Recover</strong>
            <span>Revenue Recovery</span>
          </div>
        </div>

        <div className="nav-label">Workspace</div>
        <nav className="nav-list">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${item.active ? "active" : ""}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-text">
                <span className="nav-title">{item.label}</span>
                <span className="nav-hint">{item.hint}</span>
              </span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="sidebar-foot">
        <Link href="/profile" className="sidebar-user sidebar-user-link">
          <div className="sidebar-avatar">{initial}</div>
          <div className="sidebar-user-meta">
            <strong>{displayName}</strong>
            <span>{user?.email || "merchant@autorecover.ai"}</span>
          </div>
        </Link>
        <div className="sidebar-guard">
          <span className="sidebar-guard-dot" />
          Guardrails on · confidence ≥ 0.85
        </div>
        <button type="button" className="btn-logout" onClick={logout}>
          Log out
        </button>
      </div>
    </aside>
  );
}

export function Sidebar() {
  return (
    <Suspense
      fallback={
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">AR</div>
            <div className="brand-copy">
              <strong>Auto-Recover</strong>
              <span>Revenue Recovery</span>
            </div>
          </div>
        </aside>
      }
    >
      <SidebarInner />
    </Suspense>
  );
}
