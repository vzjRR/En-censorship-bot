import { AttachmentBuilder, ChannelType, TextChannel } from "discord.js";
import { botClient, isBotReady } from "../client.js";

export interface OutgoingFile {
  buffer: Buffer;
  filename: string;
}

export interface SentAttachment {
  id: string;
  url: string;
  filename: string;
}

export interface SendLogResult {
  status: "SENT" | "FAILED";
  messageId?: string;
  attachments?: SentAttachment[];
  error?: string;
}

/**
 * Sends a message (optionally with file attachments) to a Discord channel
 * and NEVER throws. Moderation actions must be durable even when Discord is
 * unreachable — callers persist the action first, then attempt this, then
 * record whatever status comes back (see moderation/warnings and
 * moderation/bans services, and evidence/discordEvidenceStorage.ts).
 */
export async function sendChannelMessage(channelId: string, content: string, files?: OutgoingFile[]): Promise<SendLogResult> {
  try {
    if (!isBotReady()) {
      return { status: "FAILED", error: "Discord bot is not connected." };
    }

    const channel = await botClient.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      return { status: "FAILED", error: `Channel ${channelId} is not a text channel or was not found.` };
    }

    const message = await (channel as TextChannel).send({
      content,
      files: files?.map((f) => new AttachmentBuilder(f.buffer, { name: f.filename })),
    });

    return {
      status: "SENT",
      messageId: message.id,
      attachments: message.attachments.map((a) => ({ id: a.id, url: a.url, filename: a.name })),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[bot] failed to send message to channel ${channelId}:`, error);
    return { status: "FAILED", error };
  }
}

/**
 * Sends a Discord direct message (DM) to a single user and NEVER throws —
 * used for the staff welcome message, and the player/manager notifications
 * on warning/ban (see moderation/warnings, moderation/bans, staff.service).
 * Fails gracefully (status FAILED) if the bot can't reach them: DMs closed,
 * no longer sharing a server, blocked the bot, etc.
 */
export async function sendDirectMessage(discordUserId: string, content: string): Promise<SendLogResult> {
  try {
    if (!isBotReady()) {
      return { status: "FAILED", error: "Discord bot is not connected." };
    }

    const user = await botClient.users.fetch(discordUserId);
    const message = await user.send({ content });

    return { status: "SENT", messageId: message.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[bot] failed to send DM to ${discordUserId}:`, error);
    return { status: "FAILED", error };
  }
}
