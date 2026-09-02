import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DutyWidget } from "./DutyWidget";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Any one of these grants visibility — omit to show unconditionally. */
  permissions?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: "🏠", permissions: ["dashboard.view"] },
  { to: "/staff", label: "All Staff", icon: "👮", permissions: ["staff.view"] },
  { to: "/staff/on-duty", label: "On Duty", icon: "🟢" },
  { to: "/staff/sessions", label: "Staff Sessions", icon: "🕒", permissions: ["staff.view"] },
  { to: "/warnings", label: "Warnings", icon: "⚠️", permissions: ["warnings.view"] },
  { to: "/bans", label: "Bans", icon: "🔨", permissions: ["bans.view"] },
  { to: "/players", label: "Players", icon: "👤", permissions: ["players.view"] },
  { to: "/statistics", label: "Statistics", icon: "📊", permissions: ["statistics.view"] },
  { to: "/audit", label: "Audit Logs", icon: "📜", permissions: ["audit.view"] },
  {
    to: "/settings",
    label: "Settings",
    icon: "⚙️",
    // Anyone who can manage at least one settings area gets in — the page
    // itself only shows the section(s) they actually have permission for
    // (e.g. Deputy Manager sees Messages only, never Staff Roles).
    permissions: ["settings.manage", "messages.manage", "channels.manage", "test_mode.manage"],
  },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { hasAnyPermission, logout } = useAuth();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-5">
        <img
          src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/favicon.png`}
          alt=""
          className="h-8 w-8 shrink-0 rounded-full object-cover"
        />
        <div>
          <div className="text-sm font-bold tracking-wide text-slate-100">ENCLAVE RP</div>
          <div className="text-xs text-slate-500">Censorship Platform</div>
        </div>
      </div>
      <nav className="space-y-1 px-2">
        {NAV_ITEMS.filter((item) => !item.permissions || hasAnyPermission(item.permissions)).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
                isActive ? "bg-accent/15 text-accent" : "text-slate-300 hover:bg-surface-border/50"
              }`
            }
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Credits — per platform requirement, shown directly below Settings / the last nav item. */}
      <div className="border-t border-surface-border px-4 py-3 text-center text-[11px] leading-tight text-slate-600">
        <div>
          Developed by <span className="text-slate-400">vzjRR</span>
        </div>
        <div>
          Designed by <span className="text-slate-400">𝑃𝐿𝑎𝑛𝑘²¹ (@yi21_)</span>
        </div>
      </div>

      <div className="border-t border-surface-border p-3">
        <button
          onClick={() => void logout().then(() => window.location.assign(import.meta.env.BASE_URL))}
          className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-400 hover:bg-surface-border/50 hover:text-slate-200"
        >
          ↩ Log out
        </button>
      </div>
    </div>
  );
}

export function Layout() {
  const { user } = useAuth();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close the mobile drawer automatically whenever the route changes.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Desktop sidebar — always visible at md+, hidden entirely below that. */}
      <aside className="hidden w-60 shrink-0 border-r border-surface-border bg-surface-raised md:block">
        <SidebarContent />
      </aside>

      {/* Mobile off-canvas drawer + backdrop — only mounted below md. */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileNavOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-surface-border bg-surface-raised shadow-xl">
            <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col overflow-x-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-surface-border bg-surface-raised px-4 py-3 md:px-6">
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
            className="rounded-md p-2 text-slate-300 hover:bg-surface-border/50 md:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M2.5 5h15M2.5 10h15M2.5 15h15" />
            </svg>
          </button>
          <div className="flex flex-1 items-center justify-end gap-2 sm:gap-4">
            <DutyWidget />
            <div className="flex items-center gap-2">
              <div className="hidden text-right sm:block">
                <div className="text-sm font-medium text-slate-100">{user?.displayName}</div>
                <div className="text-xs text-slate-500">{user?.roleName}</div>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-sm font-semibold text-accent">
                {user?.displayName?.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
