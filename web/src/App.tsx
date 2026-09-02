import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import { Login } from "./pages/Login";
import { DashboardHome } from "./pages/DashboardHome";
import { StaffList } from "./pages/staff/StaffList";
import { OnDuty } from "./pages/staff/OnDuty";
import { StaffSessions } from "./pages/staff/StaffSessions";
import { Warnings } from "./pages/Warnings";
import { Bans } from "./pages/Bans";
import { Players } from "./pages/Players";
import { PlayerProfile } from "./pages/PlayerProfile";
import { Statistics } from "./pages/Statistics";
import { AuditLogs } from "./pages/AuditLogs";
import { Settings } from "./pages/Settings";
import { NotAuthorized } from "./pages/NotAuthorized";
import { InstallNotice } from "./components/InstallNotice";

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <Spinner />
    </div>
  );
}

function RequirePermission({
  permission,
  anyOf,
  children,
}: {
  permission?: string;
  anyOf?: string[];
  children: React.ReactNode;
}) {
  const { hasPermission, hasAnyPermission } = useAuth();
  if (permission && !hasPermission(permission)) return <NotAuthorized />;
  if (anyOf && !hasAnyPermission(anyOf)) return <NotAuthorized />;
  return <>{children}</>;
}

export function App() {
  const { user, loading } = useAuth();

  if (loading) return <FullScreenSpinner />;

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <>
      <InstallNotice />
      <Routes>
        <Route element={<Layout />}>
        <Route index element={<DashboardHome />} />
        <Route
          path="staff"
          element={
            <RequirePermission permission="staff.view">
              <StaffList />
            </RequirePermission>
          }
        />
        <Route path="staff/on-duty" element={<OnDuty />} />
        <Route
          path="staff/sessions"
          element={
            <RequirePermission permission="staff.view">
              <StaffSessions />
            </RequirePermission>
          }
        />
        <Route
          path="warnings"
          element={
            <RequirePermission permission="warnings.view">
              <Warnings />
            </RequirePermission>
          }
        />
        <Route
          path="bans"
          element={
            <RequirePermission permission="bans.view">
              <Bans />
            </RequirePermission>
          }
        />
        <Route
          path="players"
          element={
            <RequirePermission permission="players.view">
              <Players />
            </RequirePermission>
          }
        />
        <Route
          path="players/:id"
          element={
            <RequirePermission permission="players.view">
              <PlayerProfile />
            </RequirePermission>
          }
        />
        <Route
          path="statistics"
          element={
            <RequirePermission permission="statistics.view">
              <Statistics />
            </RequirePermission>
          }
        />
        <Route
          path="audit"
          element={
            <RequirePermission permission="audit.view">
              <AuditLogs />
            </RequirePermission>
          }
        />
        <Route
          path="settings"
          element={
            <RequirePermission anyOf={["settings.manage", "messages.manage", "channels.manage", "test_mode.manage"]}>
              <Settings />
            </RequirePermission>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
