import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card, StatCard, Spinner, EmptyState } from "../components/ui";

interface DetailedStats {
  period: {
    warningsToday: number;
    warningsThisWeek: number;
    warningsThisMonth: number;
    bansToday: number;
    bansThisWeek: number;
    bansThisMonth: number;
  };
  staffLeaderboard: { staffName: string; warningsIssued: number; bansIssued: number }[];
  mostWarnedPlayers: { playerId: string; playerName: string; warningCount: number }[];
  commonReasons: { reason: string; count: number }[];
}

interface PersonalStats {
  warningsIssued: number;
  bansIssued: number;
  sessions: number;
  totalOnDutyMinutes: number;
  averageSessionMinutes: number;
}

export function Statistics() {
  const [data, setData] = useState<DetailedStats | null>(null);
  const [personal, setPersonal] = useState<PersonalStats | null>(null);

  useEffect(() => {
    void api.get<DetailedStats>("/statistics/detailed").then(setData);
    void api.get<{ stats: PersonalStats }>("/statistics/me").then((res) => setPersonal(res.stats));
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
      <h1 className="text-lg font-semibold text-slate-100">Statistics</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Warnings Today" value={data.period.warningsToday} />
        <StatCard label="Warnings This Week" value={data.period.warningsThisWeek} />
        <StatCard label="Warnings This Month" value={data.period.warningsThisMonth} />
        <StatCard label="Bans Today" value={data.period.bansToday} />
        <StatCard label="Bans This Week" value={data.period.bansThisWeek} />
        <StatCard label="Bans This Month" value={data.period.bansThisMonth} />
      </div>

      {personal && (
        <Card title="My Statistics">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <StatCard label="Warnings Issued" value={personal.warningsIssued} />
            <StatCard label="Bans Issued" value={personal.bansIssued} />
            <StatCard label="Sessions" value={personal.sessions} />
            <StatCard label="Hours On Duty" value={(personal.totalOnDutyMinutes / 60).toFixed(1)} />
            <StatCard label="Avg Session (min)" value={personal.averageSessionMinutes} />
          </div>
        </Card>
      )}

      <Card title="Most Active Staff">
        {data.staffLeaderboard.length === 0 ? (
          <EmptyState message="No activity yet." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="pb-2">Staff</th>
                <th className="pb-2">Warnings</th>
                <th className="pb-2">Bans</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {data.staffLeaderboard.map((s) => (
                <tr key={s.staffName}>
                  <td className="py-2">{s.staffName}</td>
                  <td className="py-2">{s.warningsIssued}</td>
                  <td className="py-2">{s.bansIssued}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Most Warned Players">
          {data.mostWarnedPlayers.length === 0 ? (
            <EmptyState message="No data yet." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.mostWarnedPlayers.map((p) => (
                <li key={p.playerId} className="flex justify-between">
                  <span>{p.playerName}</span>
                  <span className="text-slate-400">{p.warningCount}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Most Common Warning Reasons">
          {data.commonReasons.length === 0 ? (
            <EmptyState message="No data yet." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.commonReasons.map((r) => (
                <li key={r.reason} className="flex justify-between">
                  <span>{r.reason}</span>
                  <span className="text-slate-400">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
