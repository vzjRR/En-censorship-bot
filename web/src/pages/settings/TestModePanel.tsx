import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { Card, Button, Input, Field, ErrorBanner, Spinner, StatusBadge } from "../../components/ui";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { formatDateTime } from "../../lib/format";
import type { TestModeState } from "../../lib/types";

export function TestModePanel() {
  const [state, setState] = useState<TestModeState | null | undefined>(undefined);
  const [guildId, setGuildId] = useState("1511102113135202456");
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const load = async () => {
    const res = await api.get<{ state: TestModeState | null }>("/settings/test-mode");
    setState(res.state);
  };

  useEffect(() => {
    void load();
  }, []);

  const enable = async () => {
    setEnabling(true);
    setError(null);
    try {
      const res = await api.post<{ state: TestModeState }>("/settings/test-mode/enable", { guildId });
      setState(res.state);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to enable Test Mode.");
    } finally {
      setEnabling(false);
    }
  };

  if (state === undefined) {
    return (
      <Card title="Test Mode">
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      </Card>
    );
  }

  const isEnabled = state?.enabled;

  return (
    <Card title="Test Mode" actions={isEnabled ? <StatusBadge status="ACTIVE" /> : undefined}>
      <div className="space-y-3 text-sm">
        <p className="text-slate-400">
          Redirects staff-login, warning, and ban messages to channels the bot creates in a separate test Discord server —
          your dashboard login and permissions are never affected. When you're done, Disable &amp; Clean Up removes
          everything it created there.
        </p>

        {isEnabled ? (
          <div className="rounded-md border border-ok/30 bg-ok/5 p-3">
            <div>
              Test server: <span className="font-mono">{state.guildId}</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Enabled by {state.enabledBy} at {formatDateTime(state.enabledAt)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Channels created: #mod-staff-log-test, #mod-warnings-test, #mod-bans-test
            </div>
            <div className="mt-3">
              <Button variant="danger" onClick={() => setConfirmDisable(true)}>
                Disable &amp; Clean Up Test Mode
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Field label="Test Discord Server ID">
              <Input value={guildId} onChange={(e) => setGuildId(e.target.value)} placeholder="Discord server (guild) ID" />
            </Field>
            <p className="text-xs text-slate-600">The bot must already be a member of this server, with permission to manage channels.</p>
            <ErrorBanner message={error} />
            <Button onClick={enable} disabled={enabling || !guildId}>
              {enabling ? "Enabling…" : "Enable Test Mode"}
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDisable}
        title="Disable Test Mode"
        description="This deletes the test channels (and category) created in the test server, and switches moderation messages back to the real channels. Continue?"
        confirmLabel="Disable & Clean Up"
        danger
        onCancel={() => setConfirmDisable(false)}
        onConfirm={async () => {
          const res = await api.post<{ state: TestModeState; cleanupErrors: string[] }>("/settings/test-mode/disable", { cleanup: true });
          setState(res.state);
          setConfirmDisable(false);
          if (res.cleanupErrors.length > 0) {
            alert(`Test Mode disabled, but some cleanup steps failed:\n${res.cleanupErrors.join("\n")}`);
          }
        }}
      />
    </Card>
  );
}
