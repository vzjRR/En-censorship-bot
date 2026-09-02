import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Card, Select, Input, Button, Spinner, EmptyState } from "../components/ui";
import { formatDateTime } from "../lib/format";
import type { AuditLog } from "../lib/types";

const ACTIONS = [
  "STAFF_ADDED",
  "STAFF_REMOVED",
  "STAFF_ROLE_CHANGED",
  "STAFF_UPDATED",
  "STAFF_LOGIN",
  "STAFF_LOGOUT",
  "WARNING_CREATED",
  "WARNING_EXPIRED",
  "WARNING_REVOKED",
  "BAN_CREATED",
  "BAN_EXPIRED",
  "BAN_REVOKED",
  "SETTINGS_UPDATED",
  "ACCESS_DENIED",
  "LOGIN_SUCCESS",
];

export function AuditLogs() {
  const { hasPermission } = useAuth();
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [action, setAction] = useState("");
  const [actorDiscordId, setActorDiscordId] = useState("");

  const load = async () => {
    const res = await api.get<{ logs: AuditLog[] }>("/audit", {
      action: action || undefined,
      actorDiscordId: actorDiscordId || undefined,
      limit: 200,
    });
    setLogs(res.logs);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Audit Logs</h1>
        {hasPermission("data.export") && (
          <a href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/audit?format=csv`} target="_blank" rel="noreferrer">
            <Button variant="secondary">Export CSV</Button>
          </a>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={action} onChange={(e) => setAction(e.target.value)} className="w-56">
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        <Input
          value={actorDiscordId}
          onChange={(e) => setActorDiscordId(e.target.value)}
          onBlur={load}
          placeholder="Filter by actor Discord ID"
          className="w-56"
        />
      </div>

      <Card>
        {!logs ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState message="No audit log entries found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-border text-xs uppercase text-slate-500">
                  <th className="pb-2 pr-4">Timestamp</th>
                  <th className="pb-2 pr-4">Actor</th>
                  <th className="pb-2 pr-4">Action</th>
                  <th className="pb-2 pr-4">Target</th>
                  <th className="pb-2 pr-4">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2 pr-4 text-slate-400">{formatDateTime(log.createdAt)}</td>
                    <td className="py-2 pr-4">{log.actorName ?? log.actorDiscordId ?? "system"}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{log.action}</td>
                    <td className="py-2 pr-4 text-xs text-slate-500">
                      {log.targetType} {log.targetId}
                    </td>
                    <td className="max-w-xs truncate py-2 pr-4 text-xs text-slate-600" title={JSON.stringify(log.metadata)}>
                      {JSON.stringify(log.metadata)}
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
