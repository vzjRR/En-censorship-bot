import { useState } from "react";
import { api, ApiError } from "../../lib/api";
import { Modal, Button, Input, Select, Field, ErrorBanner } from "../../components/ui";
import type { StaffRole } from "../../lib/types";

interface DiscordMemberResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export function AddStaffModal({ roles, onClose, onAdded }: { roles: StaffRole[]; onClose: () => void; onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DiscordMemberResult[]>([]);
  const [selected, setSelected] = useState<DiscordMemberResult | null>(null);
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (q: string) => {
    setQuery(q);
    setSelected(null);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await api.get<{ results: DiscordMemberResult[] }>("/staff/search-discord", { query: q });
      setResults(res.results);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const submit = async () => {
    if (!selected || !roleId) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/staff", { discordUserId: selected.id, roleId });
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add staff member.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Add Staff">
      <div className="space-y-4">
        <Field label="Search Discord Member (ID, username, or display name)">
          <Input value={query} onChange={(e) => void search(e.target.value)} placeholder="e.g. 123456789012345678 or username" />
        </Field>

        {searching && <div className="text-xs text-slate-500">Searching…</div>}

        {results.length > 0 && (
          <div className="max-h-48 divide-y divide-surface-border overflow-y-auto rounded-md border border-surface-border">
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-border/50 ${
                  selected?.id === r.id ? "bg-accent/10" : ""
                }`}
              >
                <span className="font-medium text-slate-100">{r.displayName}</span>
                <span className="text-xs text-slate-500">@{r.username}</span>
                <span className="ml-auto text-xs text-slate-600">{r.id}</span>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <Field label="Staff Role">
            <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
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
          <Button onClick={submit} disabled={!selected || !roleId || submitting}>
            {submitting ? "Adding…" : "Add Staff"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
