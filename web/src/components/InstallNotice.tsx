import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Modal, Button } from "./ui";
import { isMobileDevice, isStandaloneDisplay } from "../lib/pwa";

function storageKey(discordUserId: string) {
  return `enclave_install_notice_seen_${discordUserId}`;
}

/** One-time (per account) reminder shown on first sign-in — mobile is already gated by InstallGate, so this only ever needs to nudge desktop browsers toward installing. */
export function InstallNotice() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user || isMobileDevice() || isStandaloneDisplay()) return;
    try {
      if (!localStorage.getItem(storageKey(user.discordUserId))) setOpen(true);
    } catch {
      // localStorage unavailable (private browsing, etc.) — skip the notice.
    }
  }, [user]);

  if (!user) return null;

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(storageKey(user.discordUserId), "1");
    } catch {
      // Best-effort only — worst case the notice shows again next sign-in.
    }
  };

  return (
    <Modal open={open} onClose={dismiss} title="Install as an App">
      <div className="space-y-3 text-sm text-slate-300">
        <p>
          You can use ENCLAVE RP Censorship Platform right here in your browser, but installing it as an app gives
          you a faster, more reliable experience — and it's required on phones.
        </p>
        <p className="text-xs text-slate-500">
          Look for an install icon in your browser's address bar, or open the browser menu and choose "Install App"
          / "Add to Home Screen".
        </p>
        <div className="flex justify-end">
          <Button onClick={dismiss}>Got it</Button>
        </div>
      </div>
    </Modal>
  );
}
