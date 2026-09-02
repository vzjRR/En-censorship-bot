import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { Card, Button, TextArea, ErrorBanner, Spinner } from "../../components/ui";
import type { MessageTemplate, RevokeNotificationsConfig } from "../../lib/types";

function RevokeNotificationsToggle() {
  const [config, setConfig] = useState<RevokeNotificationsConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await api.get<{ config: RevokeNotificationsConfig }>("/settings/revoke-notifications");
    setConfig(res.config);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (next: RevokeNotificationsConfig) => {
    setConfig(next);
    setSaving(true);
    setError(null);
    try {
      await api.put("/settings/revoke-notifications", next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save.");
      void load();
    } finally {
      setSaving(false);
    }
  };

  if (!config) {
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="rounded-md border border-surface-border p-3">
      <div className="text-sm font-medium text-slate-200">Revoke Notifications</div>
      <div className="text-xs text-slate-500">
        Whether a Discord message is sent at all when a warning/ban is revoked — separate from the wording below.
      </div>

      <div className="mt-2 space-y-2">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={config.warningEnabled}
            disabled={saving}
            onChange={(e) => save({ ...config, warningEnabled: e.target.checked })}
          />
          Send a notification when a warning is revoked
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={config.banEnabled}
            disabled={saving}
            onChange={(e) => save({ ...config, banEnabled: e.target.checked })}
          />
          Send a notification when a ban is revoked
        </label>
      </div>

      <ErrorBanner message={error} />
    </div>
  );
}

function TemplateEditor({ template, onSaved }: { template: MessageTemplate; onSaved: () => void }) {
  const [value, setValue] = useState(template.current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/settings/templates/${template.key}`, { template: value });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save template.");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async () => {
    setValue(template.default);
    setSaving(true);
    setError(null);
    try {
      await api.put(`/settings/templates/${template.key}`, { template: "" });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reset template.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border border-surface-border p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-200">{template.label}</div>
          <div className="text-xs text-slate-500">{template.description}</div>
        </div>
        {template.isCustom && <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs text-accent">Customized</span>}
      </div>

      <TextArea rows={template.placeholders.length + 3} value={value} onChange={(e) => setValue(e.target.value)} className="mt-2 font-mono" />

      <div className="mt-1 text-xs text-slate-500">
        Available placeholders: {template.placeholders.map((p) => `{{${p}}}`).join(", ")}
      </div>

      <ErrorBanner message={error} />

      <div className="mt-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={resetToDefault} disabled={saving}>
          Reset to Default
        </Button>
        <Button onClick={save} disabled={saving || value === template.current}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

export function MessagesPanel() {
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);

  const load = async () => {
    const res = await api.get<{ templates: MessageTemplate[] }>("/settings/templates");
    setTemplates(res.templates);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <Card title="Messages" actions={<span className="text-xs text-slate-500">Edit the wording sent to Discord</span>}>
      {!templates ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-3">
          <RevokeNotificationsToggle />
          {templates.map((t) => (
            <TemplateEditor key={t.key} template={t} onSaved={load} />
          ))}
        </div>
      )}
    </Card>
  );
}
