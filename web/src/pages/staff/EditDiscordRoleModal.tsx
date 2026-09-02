import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { Modal, Button, Select, Field, ErrorBanner, Spinner } from "../../components/ui";
import type { StaffMember } from "../../lib/types";

interface DiscordRoleOption {
  id: string;
  name: string;
}

export function EditDiscordRoleModal({
  member,
  onClose,
  onSaved,
}: {
  member: StaffMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roles, setRoles] = useState<DiscordRoleOption[] | null>(null);
  const [discordRoleId, setDiscordRoleId] = useState(member.discordRoleId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ results: { id: string; roles: DiscordRoleOption[] }[] }>("/staff/search-discord", { query: member.discordUserId })
      .then((res) => {
        const match = res.results.find((r) => r.id === member.discordUserId);
        setRoles(match?.roles ?? []);
      })
      .catch(() => setRoles([]));
  }, [member.discordUserId]);

  const save = async () => {
    if (!discordRoleId) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/staff/${member.id}/discord-role`, { discordRoleId });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update Discord role.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Discord Role — ${member.displayName}`}>
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          This is the role shown in Discord moderation messages for this person — separate from their platform
          permission level.
        </p>

        {roles === null ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : roles.length === 0 ? (
          <p className="text-sm text-danger">
            Couldn't find this person's current Discord roles (they may have left the server, or the bot is offline).
          </p>
        ) : (
          <Field label="Discord Role">
            <Select value={discordRoleId} onChange={(e) => setDiscordRoleId(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <ErrorBanner message={error} />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!discordRoleId || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
