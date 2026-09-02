import { randomBytes } from "node:crypto";
import { discordConfig } from "../config/discordConfig.js";

export interface DiscordOAuthProfile {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

export function generateOAuthState(): string {
  return randomBytes(32).toString("hex");
}

export function buildAuthorizeUrl(state: string): string {
  const url = new URL(discordConfig.oauth.authorizeUrl);
  url.searchParams.set("client_id", discordConfig.clientId);
  url.searchParams.set("redirect_uri", discordConfig.oauth.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", discordConfig.oauth.scope);
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "none");
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/**
 * Exchanges an OAuth2 authorization code for an access token, then
 * immediately uses it to fetch the user's Discord profile. The access
 * token itself is never persisted — only the resulting identity is used to
 * establish a server-side session. Guild membership / roles are verified
 * separately using the bot's own credentials, not this user token.
 */
export async function exchangeCodeForProfile(code: string): Promise<DiscordOAuthProfile> {
  const body = new URLSearchParams({
    client_id: discordConfig.clientId,
    client_secret: discordConfig.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: discordConfig.oauth.redirectUri,
  });

  const tokenRes = await fetch(discordConfig.oauth.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "");
    throw new Error(`Discord token exchange failed (${tokenRes.status}): ${text}`);
  }

  const token = (await tokenRes.json()) as TokenResponse;

  const profileRes = await fetch(`${discordConfig.oauth.apiBase}/users/@me`, {
    headers: { Authorization: `${token.token_type} ${token.access_token}` },
  });

  if (!profileRes.ok) {
    const text = await profileRes.text().catch(() => "");
    throw new Error(`Failed to fetch Discord profile (${profileRes.status}): ${text}`);
  }

  return (await profileRes.json()) as DiscordOAuthProfile;
}
