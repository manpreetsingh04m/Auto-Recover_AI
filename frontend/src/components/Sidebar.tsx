"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { clearSession, getUser } from "@/lib/auth";
import { useSidebar } from "@/components/SidebarContext";

function NavIcon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    dashboard: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="3" width="8" height="5" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="10" width="8" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
    recovery: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 7h16M4 12h10M4 17h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="19" cy="17" r="3" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
    invoices: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M7 4h10l3 3v13H7V4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M17 4v3h3M9 11h6M9 15h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    agent: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 3a3 3 0 0 1 3 3v2H9V6a3 3 0 0 1 3-3z" stroke="currentColor" strokeWidth="1.8" />
        <rect x="5" y="8" width="14" height="10" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    conversations: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M5 6h14v9H9l-4 3V6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M8 10h8M8 13h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    audit: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M8 6h8M8 10h8M8 14h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
    profile: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5 20c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  };

  return <span className="nav-icon">{icons[name] || icons.dashboard}</span>;
}

function SidebarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const user = getUser();
  const tab = searchParams.get("tab");
  const { collapsed, toggleCollapsed, closeMobile } = useSidebar();

  function logout() {
    clearSession();
    router.replace("/login");
  }

  const items = [
    {
      href: "/",
      label: "Dashboard",
      hint: "KPIs & overview",
      icon: "dashboard",
      active: pathname === "/" && tab !== "audit",
    },
    {
      href: "/recovery",
      label: "Recovery Queue",
      hint: "Priority execute",
      icon: "recovery",
      active: pathname.startsWith("/recovery"),
    },
    {
      href: "/invoices",
      label: "Invoices",
      hint: "Full ledger",
      icon: "invoices",
      active: pathname.startsWith("/invoices"),
    },
    {
      href: "/agent",
      label: "AI Agent",
      hint: "Live voice calls",
      icon: "agent",
      active: pathname.startsWith("/agent"),
    },
    {
      href: "/conversations",
      label: "Conversations",
      hint: "Call transcripts",
      icon: "conversations",
      active: pathname.startsWith("/conversations"),
    },
    {
      href: "/?tab=audit",
      label: "AI Audit Trail",
      hint: "Decision log",
      icon: "audit",
      active: pathname === "/" && tab === "audit",
    },
    {
      href: "/profile",
      label: "Profile",
      hint: "Merchant details",
      icon: "profile",
      active: pathname.startsWith("/profile"),
    },
  ];

  const initial = (user?.name || user?.email || "M").charAt(0).toUpperCase();
  const displayName = user?.businessName || user?.name || "Merchant";

  return (
    <aside className={`sidebar${collapsed ? " is-collapsed" : ""}`}>
      <div className="sidebar-top">
        <div className="brand-row">
          <div className="brand">
            <div className="brand-mark">RA</div>
            <div className="brand-copy">
              <strong>Razorpay Revive AI</strong>
              <span>Autonomous Recovery</span>
            </div>
          </div>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              {collapsed ? (
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>

        <div className="nav-label">Workspace</div>
        <nav className="nav-list">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${item.active ? "active" : ""}`}
              title={collapsed ? item.label : undefined}
              onClick={closeMobile}
            >
              <NavIcon name={item.icon} />
              <span className="nav-text">
                <span className="nav-title">{item.label}</span>
                <span className="nav-hint">{item.hint}</span>
              </span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="sidebar-foot">
        <div className="sidebar-guard" title="Revive Agent online">
          <span className="sidebar-guard-dot" />
          <span className="sidebar-guard-text">Revive Agent online · Monitoring accounts</span>
        </div>
        <Link
          href="/profile"
          className="sidebar-user sidebar-user-link"
          title={collapsed ? displayName : undefined}
          onClick={closeMobile}
        >
          <div className="sidebar-avatar">{initial}</div>
          <div className="sidebar-user-meta">
            <strong>{displayName}</strong>
            <span>{user?.email || "merchant@autorecover.ai"}</span>
          </div>
        </Link>
        <button type="button" className="btn-logout" onClick={logout} title="Log out">
          <svg className="btn-logout-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M14 12H3m0 0l3-3M3 12l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="btn-logout-text">Log out</span>
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
            <div className="brand-mark">RA</div>
            <div className="brand-copy">
              <strong>Razorpay Revive AI</strong>
              <span>Autonomous Recovery</span>
            </div>
          </div>
        </aside>
      }
    >
      <SidebarInner />
    </Suspense>
  );
}
