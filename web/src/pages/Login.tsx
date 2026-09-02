import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ERROR_MESSAGES: Record<string, string> = {
  discord_denied: "You cancelled the Discord authorization.",
  invalid_state: "Your login session expired or was invalid. Please try again.",
  missing_code: "Discord did not return an authorization code. Please try again.",
  not_guild_member: "You are not a member of the ENCLAVE RP Discord server.",
  not_staff: "Your Discord account does not have moderation access on this platform.",
  discord_role_missing: "Your staff access is suspended because you no longer hold the required Discord role.",
  bot_unavailable: "Could not verify your Discord membership right now. Please try again shortly.",
  server_error: "Something went wrong while signing you in. Please try again.",
  session_error: "Could not establish a session. Please try again.",
};

export function Login() {
  const { loginUrl } = useAuth();
  const [params] = useSearchParams();
  const authError = params.get("authError");

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-lg border border-surface-border bg-surface-raised p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-2xl">🛡️</div>
        <h1 className="text-lg font-semibold text-slate-100">ENCLAVE RP</h1>
        <p className="mt-1 text-sm text-slate-400">Moderation Control Platform</p>

        {authError && (
          <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-left text-sm text-danger">
            {ERROR_MESSAGES[authError] ?? "Access denied."}
          </div>
        )}

        <a
          href={loginUrl()}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Login with Discord
        </a>

        <p className="mt-4 text-xs text-slate-500">Only approved moderation staff can access this dashboard.</p>
      </div>
    </div>
  );
}
