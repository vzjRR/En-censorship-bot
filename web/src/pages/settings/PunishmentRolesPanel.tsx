import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { Card, Button, Select, Input, Field, ErrorBanner, Spinner } from "../../components/ui";
import type { GuildRole, PunishmentRoleRule, PunishmentRolesConfig } from "../../lib/types";

const NO_ROLE = "";

export function PunishmentRolesPanel() {
  const [config, setConfig] = useState<PunishmentRolesConfig | null>(null);
  const [guildRoles, setGuildRoles] = useState<GuildRole[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await api.get<{ config: PunishmentRolesConfig; guildRoles: GuildRole[] }>("/settings/punishment-roles");
    setConfig(res.config);
    setGuildRoles(res.guildRoles);
  };

  useEffect(() => {
    void load();
  }, []);

  if (!config) {
    return (
      <Card title="Punishment Roles">
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      </Card>
    );
  }

  const roleName = (roleId: string) => guildRoles.find((r) => r.id === roleId)?.name ?? roleId;

  const updateRule = (index: number, patch: Partial<PunishmentRoleRule>) => {
    const next = [...config.warningRoles];
    next[index] = { ...next[index], ...patch };
    setConfig({ ...config, warningRoles: next });
  };

  const addRule = () => {
    const usedNumbers = new Set(config.warningRoles.map((r) => r.warningNumber));
    let nextNumber = 1;
    while (usedNumbers.has(nextNumber)) nextNumber += 1;
    setConfig({
      ...config,
      warningRoles: [...config.warningRoles, { warningNumber: nextNumber, discordRoleId: "", discordRoleName: "" }],
    });
  };

  const removeRule = (index: number) => {
    setConfig({ ...config, warningRoles: config.warningRoles.filter((_, i) => i !== index) });
  };

  const canSave =
    config.warningRoles.every((r) => r.discordRoleId && r.warningNumber > 0) &&
    new Set(config.warningRoles.map((r) => r.warningNumber)).size === config.warningRoles.length;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put<{ config: PunishmentRolesConfig }>("/settings/punishment-roles", config);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save punishment roles.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Punishment Roles"
      actions={<span className="text-xs text-slate-500">Owner only</span>}
    >
      <div className="space-y-4 text-sm">
        <p className="text-slate-400">
          When a warning or ban is issued, the player is automatically given the matching Discord role below (if
          their Discord ID is known) — and it's removed again the moment the warning/ban expires or is revoked.
        </p>

        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-400">Warning roles (by warning number)</div>
          {config.warningRoles.length === 0 && <p className="text-xs text-slate-600">No warning roles configured yet.</p>}
          {config.warningRoles.map((rule, i) => (
            <div key={i} className="flex items-end gap-2">
              <Field label="Warning #">
                <Input
                  type="number"
                  min={1}
                  className="w-20"
                  value={rule.warningNumber}
                  onChange={(e) => updateRule(i, { warningNumber: Number(e.target.value) })}
                />
              </Field>
              <div className="flex-1">
                <Field label="Discord role">
                  <Select
                    value={rule.discordRoleId}
                    onChange={(e) => updateRule(i, { discordRoleId: e.target.value, discordRoleName: roleName(e.target.value) })}
                  >
                    <option value={NO_ROLE}>Select a role…</option>
                    {!guildRoles.some((r) => r.id === rule.discordRoleId) && rule.discordRoleId && (
                      <option value={rule.discordRoleId}>{rule.discordRoleName || rule.discordRoleId} (not visible to the bot)</option>
                    )}
                    {guildRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button variant="secondary" onClick={() => removeRule(i)}>
                Remove
              </Button>
            </div>
          ))}
          <Button variant="secondary" onClick={addRule}>
            + Add Warning Rule
          </Button>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-400">Ban role</div>
          <Select
            value={config.banRole?.discordRoleId ?? NO_ROLE}
            onChange={(e) =>
              setConfig({
                ...config,
                banRole: e.target.value ? { discordRoleId: e.target.value, discordRoleName: roleName(e.target.value) } : null,
              })
            }
          >
            <option value={NO_ROLE}>None</option>
            {config.banRole && !guildRoles.some((r) => r.id === config.banRole!.discordRoleId) && (
              <option value={config.banRole.discordRoleId}>{config.banRole.discordRoleName} (not visible to the bot)</option>
            )}
            {guildRoles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>

        {guildRoles.length === 0 && (
          <p className="text-xs text-slate-500">Couldn't load the server's role list right now (bot offline?) — previously saved roles are kept.</p>
        )}

        <ErrorBanner message={error} />

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || !canSave}>
            {saving ? "Saving…" : "Save Punishment Roles"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
