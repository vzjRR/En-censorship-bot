import { env } from "./env.js";

/**
 * Central, typed view of every Discord-related configuration value.
 * Nothing in this file is hard-coded — everything is sourced from the
 * environment so operators can repoint the bot/dashboard without touching
 * business logic.
 */
export const discordConfig = {
  botToken: env.DISCORD_BOT_TOKEN,
  clientId: env.DISCORD_CLIENT_ID,
  clientSecret: env.DISCORD_CLIENT_SECRET,
  guildId: env.DISCORD_GUILD_ID,
  botId: env.BOT_ID,

  platformOwnerId: env.PLATFORM_OWNER_ID,

  channels: {
    staffLog: env.STAFF_LOG_CHANNEL_ID,
    warningLog: env.WARNING_CHANNEL_ID,
    banLog: env.BAN_CHANNEL_ID,
  },

  oauth: {
    // Respects BASE_PATH so the redirect URI is correct when the dashboard
    // is served from a sub-path behind a reverse proxy (e.g. Cloudflare
    // fronting https://enclaverp.cc/censorship rather than the domain root).
    redirectUri: new URL(`${env.BASE_PATH}/api/auth/discord/callback`, env.APP_BASE_URL).toString(),
    scope: "identify",
    authorizeUrl: "https://discord.com/api/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    apiBase: "https://discord.com/api/v10",
  },
} as const;
