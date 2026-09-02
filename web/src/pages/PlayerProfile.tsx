import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { Card, StatCard, StatusBadge, Spinner, EmptyState } from "../components/ui";
import { formatDateTime } from "../lib/format";
import type { Player, Warning, Ban, TimelineEvent } from "../lib/types";

interface ProfileResponse {
  player: Player;
  warnings: Warning[];
  bans: Ban[];
  activeWarnings: number;
  expiredWarnings: number;
  activeBan: Ban | null;
  expiredBans: number;
  totalActions: number;
  timeline: TimelineEvent[];
}

export function PlayerProfile() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ProfileResponse | null>(null);

  useEffect(() => {
    if (id) void api.get<ProfileResponse>(`/players/${id}`).then(setData);
  }, [id]);

  if (!data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">{data.player.playerName}</h1>
        <div className="mt-1 text-xs text-slate-500">
          {data.player.discordUserId && <span className="mr-3">Discord: {data.player.discordUserId}</span>}
          {data.player.fivemIdentifier && <span>FiveM: {data.player.fivemIdentifier}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Active Warnings" value={data.activeWarnings} tone="warn" />
        <StatCard label="Expired Warnings" value={data.expiredWarnings} />
        <StatCard label="Active Ban" value={data.activeBan ? "Yes" : "No"} tone={data.activeBan ? "danger" : "default"} />
        <StatCard label="Total Actions" value={data.totalActions} />
      </div>

      <Card title="Moderation Timeline">
        {data.timeline.length === 0 ? (
          <EmptyState message="No moderation history for this player." />
        ) : (
          <ol className="space-y-3 border-l border-surface-border pl-4">
            {data.timeline.map((event, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent" />
                <div className="text-xs text-slate-500">{formatDateTime(event.date)}</div>
                <div className="text-sm text-slate-100">{event.summary}</div>
                {event.staffName && <div className="text-xs text-slate-500">by {event.staffName}</div>}
                <div className="text-xs font-mono text-slate-600">{event.refCode}</div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card title="Warnings">
        {data.warnings.length === 0 ? (
          <EmptyState message="No warnings." />
        ) : (
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-surface-border">
              {data.warnings.map((w) => (
                <tr key={w.id}>
                  <td className="py-2 pr-4 font-mono text-xs">{w.warningCode}</td>
                  <td className="py-2 pr-4">#{w.warningNumber}</td>
                  <td className="py-2 pr-4">{w.reason}</td>
                  <td className="py-2 pr-4 text-slate-400">{formatDateTime(w.issuedAt)}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={w.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Bans">
        {data.bans.length === 0 ? (
          <EmptyState message="No bans." />
        ) : (
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-surface-border">
              {data.bans.map((b) => (
                <tr key={b.id}>
                  <td className="py-2 pr-4 font-mono text-xs">{b.banCode}</td>
                  <td className="py-2 pr-4">{b.reason}</td>
                  <td className="py-2 pr-4 text-slate-400">{formatDateTime(b.issuedAt)}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={b.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
