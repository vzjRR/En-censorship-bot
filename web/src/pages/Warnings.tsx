import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Card, Button, Select, StatusBadge, Spinner, EmptyState } from "../components/ui";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { IssueWarningModal } from "./IssueWarningModal";
import { formatDateTime, durationLabel } from "../lib/format";
import type { Warning } from "../lib/types";

export function Warnings() {
  const { hasPermission } = useAuth();
  const [warnings, setWarnings] = useState<Warning[] | null>(null);
  const [status, setStatus] = useState<string>("");
  const [showIssue, setShowIssue] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Warning | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const load = async () => {
    const res = await api.get<{ warnings: Warning[] }>("/warnings", status ? { status } : undefined);
    setWarnings(res.warnings);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-slate-100">Warnings</h1>
        <div className="flex items-center gap-2">
          {hasPermission("data.export") && (
            <a href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/warnings/export`} target="_blank" rel="noreferrer">
              <Button variant="secondary">Export CSV</Button>
            </a>
          )}
          {hasPermission("warnings.create") && <Button onClick={() => setShowIssue(true)}>Issue Warning</Button>}
        </div>
      </div>

      <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
        <option value="">All statuses</option>
        <option value="ACTIVE">Active</option>
        <option value="EXPIRED">Expired</option>
        <option value="REVOKED">Revoked</option>
      </Select>

      <Card>
        {!warnings ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : warnings.length === 0 ? (
          <EmptyState message="No warnings found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-border text-xs uppercase text-slate-500">
                  <th className="pb-2 pr-4">Code</th>
                  <th className="pb-2 pr-4">#</th>
                  <th className="pb-2 pr-4">Reason</th>
                  <th className="pb-2 pr-4">Duration</th>
                  <th className="pb-2 pr-4">Issued</th>
                  <th className="pb-2 pr-4">Staff</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Log</th>
                  {hasPermission("warnings.revoke") && <th className="pb-2 pr-4">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {warnings.map((w) => (
                  <tr key={w.id}>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-300">{w.warningCode}</td>
                    <td className="py-2 pr-4">{w.warningNumber}</td>
                    <td className="py-2 pr-4">{w.reason}</td>
                    <td className="py-2 pr-4 text-slate-400">{durationLabel(w.durationType, w.durationHours)}</td>
                    <td className="py-2 pr-4 text-slate-400">{formatDateTime(w.issuedAt)}</td>
                    <td className="py-2 pr-4 text-slate-400">{w.issuedByName}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={w.status} />
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={w.discordLogStatus} />
                    </td>
                    {hasPermission("warnings.revoke") && (
                      <td className="py-2 pr-4">
                        {w.status === "ACTIVE" && (
                          <Button variant="danger" className="!px-2 !py-1 text-xs" onClick={() => setRevokeTarget(w)}>
                            Revoke
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showIssue && <IssueWarningModal onClose={() => setShowIssue(false)} onCreated={load} />}

      <ConfirmDialog
        open={!!revokeTarget}
        title={`Revoke ${revokeTarget?.warningCode}`}
        description={
          <div className="space-y-2">
            <p>Provide a reason for revoking this warning.</p>
            <textarea
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-slate-100"
              rows={3}
            />
          </div>
        }
        confirmLabel="Revoke"
        danger
        onCancel={() => {
          setRevokeTarget(null);
          setRevokeReason("");
        }}
        onConfirm={async () => {
          if (!revokeTarget || revokeReason.trim().length < 3) throw new Error("A reason of at least 3 characters is required.");
          await api.post(`/warnings/${revokeTarget.id}/revoke`, { reason: revokeReason });
          setRevokeTarget(null);
          setRevokeReason("");
          void load();
        }}
      />
    </div>
  );
}
