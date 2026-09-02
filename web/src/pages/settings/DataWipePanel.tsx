import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, Button, Input, Field, Spinner } from "../../components/ui";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import type { DataWipeCategory, DataWipeResult } from "../../lib/types";

const CONFIRM_PHRASE = "WIPE";

export function DataWipePanel() {
  const [categories, setCategories] = useState<DataWipeCategory[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmText, setConfirmText] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<DataWipeResult | null>(null);

  useEffect(() => {
    void api.get<{ categories: DataWipeCategory[] }>("/settings/data-wipe/categories").then((res) => setCategories(res.categories));
  }, []);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const canWipe = selected.size > 0 && confirmText === CONFIRM_PHRASE;

  const runWipe = async () => {
    setResult(null);
    const res = await api.post<DataWipeResult>("/settings/data-wipe", {
      categories: Array.from(selected),
      confirm: true,
    });
    setResult(res);
    setSelected(new Set());
    setConfirmText("");
    setConfirmOpen(false);
  };

  if (!categories) {
    return (
      <Card title="Danger Zone — Wipe Data">
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      </Card>
    );
  }

  return (
    <Card title="Danger Zone — Wipe Data">
      <div className="space-y-4 text-sm">
        <p className="text-slate-400">
          Owner-only. Permanently and immediately deletes the selected data — this cannot be undone and does not go through
          the platform's normal revoke/deactivate flow. Choose exactly what to wipe.
        </p>

        <div className="space-y-2 rounded-md border border-danger/30 bg-danger/5 p-3">
          {categories.map((cat) => (
            <label key={cat.key} className="flex items-start gap-2 text-slate-200">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={selected.has(cat.key)}
                onChange={() => toggle(cat.key)}
              />
              <span>{cat.label}</span>
            </label>
          ))}
        </div>

        <Field label={`Type "${CONFIRM_PHRASE}" to enable the wipe button`}>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={CONFIRM_PHRASE} />
        </Field>

        <Button variant="danger" disabled={!canWipe} onClick={() => setConfirmOpen(true)}>
          Wipe Selected Data
        </Button>

        {result && (
          <div className="rounded-md border border-ok/30 bg-ok/5 p-3 text-xs text-slate-300">
            <div className="font-medium text-ok">Wipe complete.</div>
            <ul className="mt-1 space-y-0.5">
              {Object.entries(result.rowsDeleted).map(([key, count]) => (
                <li key={key}>
                  {key}: {count} row(s) deleted
                </li>
              ))}
            </ul>
            {result.testModeCleanupErrors.length > 0 && (
              <div className="mt-2 text-warn">
                Test Mode cleanup issues: {result.testModeCleanupErrors.join("; ")}
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm data wipe"
        danger
        confirmLabel="Yes, permanently wipe"
        description={
          <div className="space-y-2">
            <p>You are about to permanently delete:</p>
            <ul className="list-disc space-y-1 pl-5">
              {categories
                .filter((c) => selected.has(c.key))
                .map((c) => (
                  <li key={c.key}>{c.label}</li>
                ))}
            </ul>
            <p className="text-danger">This action cannot be undone.</p>
          </div>
        }
        onCancel={() => setConfirmOpen(false)}
        onConfirm={runWipe}
      />
    </Card>
  );
}
