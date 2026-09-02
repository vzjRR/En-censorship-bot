import { useEffect, useState, type ReactNode } from "react";
import { isIosDevice, isMobileDevice, isStandaloneDisplay } from "../lib/pwa";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Phones must install the app before they can use it at all (per platform
 * requirement); desktop browsers are always allowed straight through — the
 * one-time install recommendation for them lives in InstallNotice instead.
 */
export function InstallGate({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(isStandaloneDisplay());
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => setInstalled(true);
    const mq = window.matchMedia("(display-mode: standalone)");
    const onDisplayModeChange = () => setInstalled(isStandaloneDisplay());

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    mq.addEventListener?.("change", onDisplayModeChange);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      mq.removeEventListener?.("change", onDisplayModeChange);
    };
  }, []);

  if (installed || !isMobileDevice()) {
    return <>{children}</>;
  }

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
    } finally {
      setDeferredPrompt(null);
      setInstalling(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
      <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="" className="h-16 w-16 rounded-full object-cover" />
      <h1 className="text-lg font-semibold text-slate-100">Install the App to Continue</h1>
      <p className="max-w-sm text-sm text-slate-400">
        ENCLAVE RP Censorship Platform must be installed on your phone before you can use it. This only takes a
        moment — once installed, open it from your home screen.
      </p>

      {deferredPrompt ? (
        <button
          onClick={() => void promptInstall()}
          disabled={installing}
          className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-40"
        >
          {installing ? "Installing…" : "Install App"}
        </button>
      ) : isIosDevice() ? (
        <p className="max-w-sm text-xs text-slate-500">
          Tap the Share icon in Safari, then "Add to Home Screen", then open ENCLAVE Censorship from your home
          screen.
        </p>
      ) : (
        <p className="max-w-sm text-xs text-slate-500">
          Open your browser menu and choose "Add to Home Screen" or "Install App", then open it from your home
          screen.
        </p>
      )}
    </div>
  );
}
