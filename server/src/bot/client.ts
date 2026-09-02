import { Client, GatewayIntentBits, Partials } from "discord.js";
import { discordConfig } from "../config/discordConfig.js";

export const botClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember, Partials.User],
});

let readyPromise: Promise<void> | null = null;

export function startBot(): Promise<void> {
  if (readyPromise) return readyPromise;

  readyPromise = new Promise((resolve, reject) => {
    botClient.once("ready", () => {
      console.log(`[bot] logged in as ${botClient.user?.tag}`);
      resolve();
    });
    botClient.once("error", reject);
    botClient.login(discordConfig.botToken).catch(reject);
  });

  return readyPromise;
}

export function isBotReady(): boolean {
  return botClient.isReady();
}

export async function getModerationGuild() {
  return getGuildById(discordConfig.guildId);
}

/**
 * Fetches an arbitrary guild by ID via the bot. Used for the moderation
 * guild (fixed, from DISCORD_GUILD_ID) and, separately, for Test Mode's
 * one-off channel-management calls against whatever guild ID an admin
 * points it at — see settings/testMode.service.ts.
 */
export async function getGuildById(guildId: string) {
  if (!botClient.isReady()) {
    throw new Error("Discord bot is not connected yet.");
  }
  const cached = botClient.guilds.cache.get(guildId);
  if (cached) return cached;
  return botClient.guilds.fetch(guildId);
}
