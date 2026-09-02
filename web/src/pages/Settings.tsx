import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { Card, StatusBadge, Button, Input, Field, ErrorBanner, Spinner } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { MessagesPanel } from "./settings/MessagesPanel";
import { ChannelsPanel } from "./settings/ChannelsPanel";
import { TestModePanel } from "./settings/TestModePanel";
import { PunishmentRolesPanel } from "./settings/PunishmentRolesPanel";
import { DataWipePanel } from "./settings/DataWipePanel";
import type { StaffRole } from "../lib/types";

interface PlatformConfig {
  platformOwnerId: string;
  botId: string;
  guildId: string;
  channels: { staffLog: string; warningLog: string; banLog: string };
  timezone: string;
  botConnected: boolean;
}

const ALL_PERMISSIONS = [
  "dashboard.view",
  "staff.view",
  "staff.manage",
  "duty.toggle",
  "duty.view_all",
  "warnings.view",
  "warnings.create",
  "warnings.revoke",
  "bans.view",
  "bans.create",
  "bans.revoke",
  "players.view",
  "statistics.view",
  "audit.view",
  "settings.manage",
  "messages.manage",
  "channels.manage",
  "test_mode.manage",
  "data.export",
];

function RoleEditor({ role, onSaved }: { role: StaffRole; onSaved: () => void }) {
  const [permissions, setPermissions] = useState<string[]>(role.permissions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (perm: string) => {
    setPermissions((prev) => (prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/staff/roles/${role.id}`, { permissions });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save role.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="rounded-md border border-surface-border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-200">
        {role.name} <span className="text-xs text-slate-500">(rank {role.rank})</span>
      </summary>
      <div className="border-t border-surface-border p-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {ALL_PERMISSIONS.map((perm) => (
            <label key={perm} className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={permissions.includes(perm)} onChange={() => toggle(perm)} />
              {perm}
            </label>
          ))}
        </div>
        <ErrorBanner message={error} />
        <div className="mt-3 flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save Permissions"}
          </Button>
        </div>
      </div>
    </details>
  );
}

function NewRoleForm({ onCreated }: { onCreated: () => void }) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [rank, setRank] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post("/staff/roles", { key, name, rank, permissions: ["dashboard.view", "duty.toggle"] });
      setKey("");
      setName("");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create role.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-dashed border-surface-border p-3">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Key (snake_case)">
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="senior_staff" />
        </Field>
        <Field label="Display Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Senior Staff" />
        </Field>
        <Field label="Rank">
          <Input type="number" value={rank} onChange={(e) => setRank(Number(e.target.value))} />
        </Field>
      </div>
      <ErrorBanner message={error} />
      <Button onClick={submit} disabled={saving || !key || !name}>
        + Add Role
      </Button>
    </div>
  );
}

export function Settings() {
  const { user, hasPermission } = useAuth();
  const canManageSettings = hasPermission("settings.manage");
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [roles, setRoles] = useState<StaffRole[] | null>(null);

  const loadRoles = async () => {
    const res = await api.get<{ roles: StaffRole[] }>("/staff/roles");
    setRoles(res.roles);
  };

  useEffect(() => {
    if (!canManageSettings) return;
    void api.get<PlatformConfig>("/settings/config").then(setConfig);
    void loadRoles();
  }, [canManageSettings]);

  if (canManageSettings && (!config || !roles)) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-100">Settings</h1>

      {canManageSettings && config && (
        <Card title="Platform Configuration">
          <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Discord Bot</dt>
              <dd className="flex items-center gap-2">
                <StatusBadge status={config.botConnected ? "ACTIVE" : "FAILED"} /> {config.botId}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Platform Owner ID</dt>
              <dd className="font-mono text-slate-300">{config.platformOwnerId}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Guild ID</dt>
              <dd className="font-mono text-slate-300">{config.guildId}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Timezone</dt>
              <dd className="text-slate-300">{config.timezone}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Staff Log Channel</dt>
              <dd className="font-mono text-slate-300">{config.channels.staffLog}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Warning Log Channel</dt>
              <dd className="font-mono text-slate-300">{config.channels.warningLog}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Ban Log Channel</dt>
              <dd className="font-mono text-slate-300">{config.channels.banLog}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-slate-600">
            The Discord IDs above are the environment defaults. Use Channels below to route individual message types
            elsewhere, or Test Mode to redirect everything to a sandbox server.
          </p>
        </Card>
      )}

      {canManageSettings && roles && (
        <Card title="Staff Roles & Permissions">
          <div className="space-y-2">
            {roles.map((role) => (
              <RoleEditor key={role.id} role={role} onSaved={loadRoles} />
            ))}
            <NewRoleForm onCreated={loadRoles} />
          </div>
        </Card>
      )}

      {hasPermission("messages.manage") && <MessagesPanel />}
      {hasPermission("channels.manage") && <ChannelsPanel />}
      {hasPermission("test_mode.manage") && <TestModePanel />}
      {user?.isPlatformOwner && <PunishmentRolesPanel />}
      {user?.isPlatformOwner && <DataWipePanel />}
    </div>
  );
}
