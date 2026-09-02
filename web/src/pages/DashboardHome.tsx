import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { StatCard, Card, EmptyState, Spinner } from "../components/ui";
import { formatDateTime } from "../lib/format";
import type { StaffSession } from "../lib/types";

interface Overview {
  staffOnline: number;
  activeWarnings: number;
  activeBans: number;
  warningsToday: number;
  bansToday: number;
  warningsThisWeek: number;
  bansThisWeek: number;
  onDutyStaff: StaffSession[];
}

export function DashboardHome() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    void api.get<Overview>("/statistics/overview").then(setData);
  }, []);

  if (!data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-100">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Staff Online" value={data.staffOnline} tone="ok" />
        <StatCard label="Active Warnings" value={data.activeWarnings} tone="warn" />
        <StatCard label="Active Bans" value={data.activeBans} tone="danger" />
        <StatCard label="Warnings Today" value={data.warningsToday} />
        <StatCard label="Bans Today" value={data.bansToday} />
        <StatCard label="Warnings This Week" value={data.warningsThisWeek} />
        <StatCard label="Bans This Week" value={data.bansThisWeek} />
      </div>

      <Card title="Currently On Duty" actions={<Link to="/staff/on-duty" className="text-xs text-accent hover:underline">View all</Link>}>
        {data.onDutyStaff.length === 0 ? (
          <EmptyState message="No staff are currently on duty." />
        ) : (
          <ul className="divide-y divide-surface-border">
            {data.onDutyStaff.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
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
