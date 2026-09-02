import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { Modal, Button, Input, Select, Field, ErrorBanner } from "../components/ui";
import { DURATION_OPTIONS_WARNING, WARNING_REASON_PRESETS } from "../lib/types";

export function IssueWarningModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [playerName, setPlayerName] = useState("");
  const [playerDiscordId, setPlayerDiscordId] = useState("");
  const [fivemIdentifier, setFivemIdentifier] = useState("");
  const [reasonPreset, setReasonPreset] = useState(WARNING_REASON_PRESETS[0]);
  const [customReason, setCustomReason] = useState("");
  const [useCustomReason, setUseCustomReason] = useState(false);
  const [durationType, setDurationType] = useState("7_days");
  const [customHours, setCustomHours] = useState(24);
  const [warningNumber, setWarningNumber] = useState<number | "">("");
  const [suggested, setSuggested] = useState<{ previousWarnings: number; suggested: number } | null>(null);
  const [evidence, setEvidence] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (!playerDiscordId && !playerName && !fivemIdentifier) return;
      void api
        .get<{ previousWarnings: number; suggested: number }>("/warnings/suggest-number", {
          playerDiscordId: playerDiscordId || undefined,
          playerName: playerName || undefined,
          fivemIdentifier: fivemIdentifier || undefined,
        })
        .then((res) => setSuggested(res))
        .catch(() => setSuggested(null));
    }, 400);
    return () => clearTimeout(handle);
  }, [playerDiscordId, playerName, fivemIdentifier]);

  const submit = async () => {
    if (!playerName || (!useCustomReason && !reasonPreset) || (useCustomReason && !customReason)) return;
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("playerName", playerName);
      if (playerDiscordId) formData.set("playerDiscordId", playerDiscordId);
      if (fivemIdentifier) formData.set("fivemIdentifier", fivemIdentifier);
      formData.set("reason", useCustomReason ? customReason : reasonPreset);
      formData.set("durationType", durationType);
      if (durationType === "CUSTOM") formData.set("customDurationHours", String(customHours));
      if (warningNumber !== "") formData.set("warningNumber", String(warningNumber));
      if (evidence) formData.set("evidence", evidence);

      const res = await api.postForm<{ warning: { warningCode: string } }>("/warnings", formData);
      onCreated();
      onClose();
      alert(`Warning ${res.warning.warningCode} created successfully.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to issue warning.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Issue Warning">
      <div className="space-y-4">
        <Field label="Player Discord ID (optional)">
          <Input value={playerDiscordId} onChange={(e) => setPlayerDiscordId(e.target.value)} placeholder="e.g. 123456789012345678" />
        </Field>
        <Field label="Player Name" required>
          <Input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Player display name" />
        </Field>
        <Field label="FiveM Identifier (optional)">
          <Input value={fivemIdentifier} onChange={(e) => setFivemIdentifier(e.target.value)} placeholder="e.g. steam:1100001..." />
        </Field>

        <Field label="Warning Number">
          <div className="flex items-center gap-2">
            <Select value={warningNumber} onChange={(e) => setWarningNumber(e.target.value ? Number(e.target.value) : "")} className="w-32">
              <option value="">Auto</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
            {suggested && (
              <span className="text-xs text-slate-500">
                Previous: {suggested.previousWarnings} — Suggested: #{suggested.suggested}
              </span>
            )}
          </div>
        </Field>

        <Field label="Reason" required>
          <div className="space-y-2">
            <Select
              value={useCustomReason ? "__custom__" : reasonPreset}
              onChange={(e) => {
                if (e.target.value === "__custom__") setUseCustomReason(true);
                else {
                  setUseCustomReason(false);
                  setReasonPreset(e.target.value);
                }
              }}
            >
              {WARNING_REASON_PRESETS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value="__custom__">Custom…</option>
            </Select>
            {useCustomReason && <Input value={customReason} onChange={(e) => setCustomReason(e.target.value)} placeholder="Describe the reason" />}
          </div>
        </Field>

        <Field label="Duration">
          <div className="flex items-center gap-2">
            <Select value={durationType} onChange={(e) => setDurationType(e.target.value)}>
              {DURATION_OPTIONS_WARNING.map((d) => (
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

        <Field label="Evidence (optional — image or video)">
          <input type="file" accept="image/*,video/*" onChange={(e) => setEvidence(e.target.files?.[0] ?? null)} className="text-sm text-slate-300" />
        </Field>

        <ErrorBanner message={error} />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !playerName}>
            {submitting ? "Issuing…" : "Issue Warning"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
