import { NavLink, Outlet } from "react-router-dom";
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

export function Layout() {
  const { user, hasAnyPermission, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="flex w-60 shrink-0 flex-col border-r border-surface-border bg-surface-raised">
        <div className="flex items-center gap-2 px-4 py-5">
          <img
            src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/favicon.png`}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
          />
          <div>
            <div className="text-sm font-bold tracking-wide text-slate-100">ENCLAVE RP</div>
            <div className="text-xs text-slate-500">Censorship Platform</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {NAV_ITEMS.filter((item) => !item.permissions || hasAnyPermission(item.permissions)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
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

        {/* Credits — per platform requirement, shown directly below Settings / as the sidebar footer. */}
        <div className="border-t border-surface-border px-4 py-3 text-center text-[11px] leading-tight text-slate-600">
          <div>
            Developed by <span className="text-slate-400">vzjRR</span>
          </div>
          <div>
            Designed by <span className="text-slate-400">𝑃𝐿𝑎𝑛𝑘²¹ (@yi21_)</span>
          </div>
        </div>

        <div className="border-t border-surface-border p-3">
          <button onClick={() => void logout().then(() => window.location.assign(import.meta.env.BASE_URL))} className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-400 hover:bg-surface-border/50 hover:text-slate-200">
            ↩ Log out
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-surface-border bg-surface-raised px-6 py-3">
          <div />
          <div className="flex items-center gap-4">
            <DutyWidget />
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-sm font-medium text-slate-100">{user?.displayName}</div>
                <div className="text-xs text-slate-500">{user?.roleName}</div>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-sm font-semibold text-accent">
                {user?.displayName?.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
