import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Card, Spinner, EmptyState, StatusBadge, Button } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import type { StaffSession } from "../../lib/types";

export function StaffSessions() {
  const { hasPermission } = useAuth();
  const [sessions, setSessions] = useState<StaffSession[] | null>(null);

  const load = async () => {
    const res = await api.get<{ sessions: StaffSession[] }>("/staff/duty/history", { limit: 200 });
    setSessions(res.sessions);
  };

  useEffect(() => {
    void load();
  }, []);

  if (!sessions) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Staff Sessions</h1>
        {hasPermission("data.export") && (
          <a href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/staff/duty/export`} target="_blank" rel="noreferrer">
            <Button variant="secondary">Export CSV</Button>
          </a>
        )}
      </div>
      <Card>
        {sessions.length === 0 ? (
          <EmptyState message="No duty sessions recorded yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-border text-xs uppercase text-slate-500">
                  <th className="pb-2 pr-4">Staff</th>
                  <th className="pb-2 pr-4">Role</th>
                  <th className="pb-2 pr-4">Login</th>
                  <th className="pb-2 pr-4">Logout</th>
                  <th className="pb-2 pr-4">Notes</th>
                  <th className="pb-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 pr-4 font-medium text-slate-100">{s.staffName}</td>
                    <td className="py-2 pr-4 text-slate-400">{s.staffRole}</td>
                    <td className="py-2 pr-4 text-slate-400">{formatDateTime(s.loginTime)}</td>
                    <td className="py-2 pr-4 text-slate-400">{s.logoutTime ? formatDateTime(s.logoutTime) : "—"}</td>
                    <td className="py-2 pr-4 text-slate-400">{s.notes ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
