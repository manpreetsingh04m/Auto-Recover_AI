"use client";

import { SidebarProvider, useSidebar } from "@/components/SidebarContext";
import { Sidebar } from "@/components/Sidebar";

function AppShellFrame({ children }: { children: React.ReactNode }) {
  const { collapsed, mobileOpen, closeMobile, toggleMobile } = useSidebar();

  return (
    <>
      <div
        className={[
          "app-shell",
          collapsed ? "sidebar-collapsed" : "",
          mobileOpen ? "sidebar-mobile-open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <Sidebar />
        <div className="app-content">
          <header className="mobile-topbar">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={toggleMobile}
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                {mobileOpen ? (
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d="M4 7h16M4 12h16M4 17h16"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            </button>
            <div className="mobile-topbar-brand">
              <span className="mobile-topbar-mark">RA</span>
              <strong>Razorpay Revive AI</strong>
            </div>
          </header>
          {children}
        </div>
      </div>
      <button
        type="button"
        className={`sidebar-backdrop${mobileOpen ? " visible" : ""}`}
        aria-label="Close navigation"
        onClick={closeMobile}
        tabIndex={mobileOpen ? 0 : -1}
      />
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppShellFrame>{children}</AppShellFrame>
    </SidebarProvider>
  );
}
