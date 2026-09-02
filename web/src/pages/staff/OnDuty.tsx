import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, Spinner, EmptyState } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import type { StaffSession } from "../../lib/types";

export function OnDuty() {
  const [sessions, setSessions] = useState<StaffSession[] | null>(null);

  useEffect(() => {
    void api.get<{ sessions: StaffSession[] }>("/staff/duty/on-duty").then((res) => setSessions(res.sessions));
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
      <h1 className="text-lg font-semibold text-slate-100">Currently On Duty</h1>
      <Card>
        {sessions.length === 0 ? (
          <EmptyState message="No staff are currently on duty." />
        ) : (
          <ul className="divide-y divide-surface-border">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <div className="font-medium text-slate-100">{s.staffName}</div>
                  <div className="text-xs text-slate-500">{s.staffRole}</div>
                </div>
                <div className="text-xs text-slate-400">Since {formatDateTime(s.loginTime)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
