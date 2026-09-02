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
  if (!botClient.isReady()) {
    throw new Error("Discord bot is not connected yet.");
  }
  const guild = botClient.guilds.cache.get(discordConfig.guildId);
  if (guild) return guild;
  return botClient.guilds.fetch(discordConfig.guildId);
}
