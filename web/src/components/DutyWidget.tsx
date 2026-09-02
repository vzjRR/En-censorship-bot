import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button, TextArea } from "./ui";
import { formatDateTime } from "../lib/format";
import type { StaffSession } from "../lib/types";

export function DutyWidget() {
  const { hasPermission } = useAuth();
  const [session, setSession] = useState<StaffSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogout, setShowLogout] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await api.get<{ onDuty: boolean; session: StaffSession | null }>("/staff/duty/status");
      setSession(res.onDuty ? res.session : null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (!hasPermission("duty.toggle")) return null;
  if (loading) return null;

  const handleLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ session: StaffSession }>("/staff/duty/login");
      setSession(res.session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start duty.");
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/staff/duty/logout", { notes: notes || undefined });
      setSession(null);
      setShowLogout(false);
      setNotes("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to end duty.");
    } finally {
      setBusy(false);
    }
  };

  if (!session) {
    return (
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-danger">{error}</span>}
        <Button onClick={handleLogin} disabled={busy}>
          دخول الرقابة
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-3 rounded-md border border-ok/30 bg-ok/10 px-3 py-1.5">
        <div className="text-xs">
          <div className="font-medium text-ok">أنت الآن في الخدمة</div>
          <div className="text-slate-400">وقت الدخول: {formatDateTime(session.loginTime)}</div>
        </div>
        <Button variant="secondary" onClick={() => setShowLogout((v) => !v)} disabled={busy}>
          خروج الرقابة
        </Button>
      </div>

      {showLogout && (
        <div className="absolute right-0 z-10 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-surface-border bg-surface-raised p-3 shadow-xl">
          <label className="mb-1 block text-xs text-slate-400">ملاحظات:</label>
          <TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختياري" />
          {error && <div className="mt-2 text-xs text-danger">{error}</div>}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowLogout(false)} disabled={busy}>
              إلغاء
            </Button>
            <Button onClick={handleLogout} disabled={busy}>
              تأكيد الخروج
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
