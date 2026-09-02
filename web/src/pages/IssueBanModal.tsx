import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { Modal, Button, Input, Select, Field, ErrorBanner } from "../components/ui";
import { DURATION_OPTIONS_BAN } from "../lib/types";

export function IssueBanModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [playerName, setPlayerName] = useState("");
  const [playerDiscordId, setPlayerDiscordId] = useState("");
  const [fivemIdentifier, setFivemIdentifier] = useState("");
  const [reason, setReason] = useState("");
  const [durationType, setDurationType] = useState("6_hours");
  const [customHours, setCustomHours] = useState(24);
  const [evidence, setEvidence] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = playerName.trim() && reason.trim() && evidence;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("playerName", playerName);
      if (playerDiscordId) formData.set("playerDiscordId", playerDiscordId);
      if (fivemIdentifier) formData.set("fivemIdentifier", fivemIdentifier);
      formData.set("reason", reason);
      formData.set("durationType", durationType);
      if (durationType === "CUSTOM") formData.set("customDurationHours", String(customHours));
      formData.set("evidence", evidence!);

      const res = await api.postForm<{ ban: { banCode: string } }>("/bans", formData);
      onCreated();
      onClose();
      alert(`Ban ${res.ban.banCode} created successfully.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to issue ban.");
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };

  const durationLabel = DURATION_OPTIONS_BAN.find((d) => d.value === durationType)?.label ?? durationType;

  if (confirming) {
    return (
      <Modal open onClose={() => setConfirming(false)} title="Confirm Ban">
        <div className="space-y-3 text-sm">
          <p className="text-slate-300">You are about to issue a {durationLabel.toLowerCase()} ban.</p>
          <div className="rounded-md border border-surface-border bg-surface p-3">
            <div>
              <span className="text-slate-500">Player:</span> {playerName}
            </div>
            <div>
              <span className="text-slate-500">Reason:</span> {reason}
            </div>
            <div>
              <span className="text-slate-500">Duration:</span> {durationLabel}
            </div>
            <div>
              <span className="text-slate-500">Evidence:</span> {evidence?.name} (attached)
            </div>
          </div>
          <ErrorBanner message={error} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={submitting}>
              Back
            </Button>
            <Button variant="danger" onClick={submit} disabled={submitting}>
              {submitting ? "Issuing…" : "Confirm & Issue Ban"}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Issue Ban">
      <div className="space-y-4">
        <Field label="Player Discord ID (optional)">
          <Input value={playerDiscordId} onChange={(e) => setPlayerDiscordId(e.target.value)} placeholder="e.g. 123456789012345678" />
        </Field>
        <Field label="Player Name" required>
          <Input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Player display name" />
        </Field>
        <Field label="FiveM Identifier / Player ID">
          <Input value={fivemIdentifier} onChange={(e) => setFivemIdentifier(e.target.value)} placeholder="e.g. steam:1100001..." />
        </Field>
        <Field label="Duration">
          <div className="flex items-center gap-2">
            <Select value={durationType} onChange={(e) => setDurationType(e.target.value)}>
              {DURATION_OPTIONS_BAN.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
            {durationType === "CUSTOM" && (
              <Input type="number" min={1} value={customHours} onChange={(e) => setCustomHours(Number(e.target.value))} className="w-28" />
            )}
            {durationType === "CUSTOM" && <span className="text-xs text-slate-500">hours</span>}
          </div>
        </Field>
        <Field label="Reason" required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe the reason" />
        </Field>
        <Field label="Evidence" required>
          <input type="file" accept="image/*,video/*" onChange={(e) => setEvidence(e.target.files?.[0] ?? null)} className="text-sm text-slate-300" />
          {!evidence && <p className="mt-1 text-xs text-danger">Evidence is required before issuing a ban.</p>}
        </Field>

        <ErrorBanner message={error} />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => setConfirming(true)} disabled={!canSubmit}>
            Issue Ban
          </Button>
        </div>
      </div>
    </Modal>
  );
}
