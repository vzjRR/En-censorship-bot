import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { Card, Button, Select, Field, ErrorBanner, Spinner } from "../../components/ui";
import type { ChannelRouting, GuildTextChannel } from "../../lib/types";

const MESSAGE_TYPES: { key: keyof ChannelRouting; label: string }[] = [
  { key: "staffLog", label: "Staff Login / Logout" },
  { key: "warningLog", label: "Warnings" },
  { key: "banLog", label: "Bans" },
];

export function ChannelsPanel() {
  const [routing, setRouting] = useState<ChannelRouting | null>(null);
  const [defaults, setDefaults] = useState<ChannelRouting | null>(null);
  const [channels, setChannels] = useState<GuildTextChannel[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await api.get<{ routing: ChannelRouting; defaults: ChannelRouting; guildChannels: GuildTextChannel[] }>("/settings/channels");
    setRouting(res.routing);
    setDefaults(res.defaults);
    setChannels(res.guildChannels);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!routing) return;
    setSaving(true);
    setError(null);
    try {
      await api.put("/settings/channels", routing);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save channel routing.");
    } finally {
      setSaving(false);
    }
  };

  if (!routing || !defaults) {
    return (
      <Card title="Channels">
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      </Card>
    );
  }

  return (
    <Card title="Channels" actions={<span className="text-xs text-slate-500">Choose which channel each message type is sent to</span>}>
      <div className="space-y-3">
        {MESSAGE_TYPES.map((mt) => (
          <Field key={mt.key} label={mt.label}>
            <Select value={routing[mt.key]} onChange={(e) => setRouting({ ...routing, [mt.key]: e.target.value })}>
              {!channels.some((c) => c.id === routing[mt.key]) && (
                <option value={routing[mt.key]}>#{routing[mt.key]} (not visible to the bot — enter manually below)</option>
              )}
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                  {c.categoryName ? ` (${c.categoryName})` : ""}
                </option>
              ))}
            </Select>
            {channels.length === 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Couldn't load the server's channel list right now (bot offline?) — the currently configured ID is kept.
              </p>
            )}
          </Field>
        ))}

        <ErrorBanner message={error} />

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save Channel Routing"}
          </Button>
        </div>

        <p className="text-xs text-slate-600">
          Defaults (from environment): staff log #{defaults.staffLog}, warnings #{defaults.warningLog}, bans #{defaults.banLog}.
        </p>
      </div>
    </Card>
  );
}
