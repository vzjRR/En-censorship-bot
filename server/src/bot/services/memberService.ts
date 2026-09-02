import { ChannelType } from "discord.js";
import { getModerationGuild } from "../client.js";

export interface GuildMemberSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  roleIds: string[];
}

function toSummary(member: import("discord.js").GuildMember): GuildMemberSummary {
  return {
    id: member.id,
    username: member.user.username,
    displayName: member.displayName,
    avatarUrl: member.displayAvatarURL({ size: 64 }),
    roleIds: member.roles.cache.map((r) => r.id),
  };
}

/** Fetches a single guild member's current roles directly from Discord (bot credentials). */
export async function fetchGuildMember(discordUserId: string): Promise<GuildMemberSummary | null> {
  const guild = await getModerationGuild();
  try {
    const member = await guild.members.fetch(discordUserId);
    return toSummary(member);
  } catch (err: any) {
    if (err?.code === 10007 /* Unknown Member */) return null;
    throw err;
  }
}

/**
 * Searches guild members by username / display name prefix, used by the
 * "Add Staff" and warning/ban player-search UI. Falls back to a direct ID
 * lookup when the query looks like a Discord snowflake.
 */
export async function searchGuildMembers(query: string, limit = 10): Promise<GuildMemberSummary[]> {
  const guild = await getModerationGuild();
  const trimmed = query.trim();
  if (!trimmed) return [];

  if (/^\d{15,25}$/.test(trimmed)) {
    const direct = await fetchGuildMember(trimmed);
    return direct ? [direct] : [];
  }

  const results = await guild.members.search({ query: trimmed, limit });
  return results.map(toSummary);
}

export function getRoleIdsFromSummary(summary: GuildMemberSummary): string[] {
  return summary.roleIds;
}

export interface GuildTextChannelSummary {
  id: string;
  name: string;
  categoryName: string | null;
}

/** Lists text channels in the production moderation guild, for the channel-routing picker in Settings. */
export async function listGuildTextChannels(): Promise<GuildTextChannelSummary[]> {
  const guild = await getModerationGuild();
  const channels = await guild.channels.fetch();
  return channels
    .filter((c): c is NonNullable<typeof c> => c !== null && c.type === ChannelType.GuildText)
    .map((c) => ({ id: c.id, name: c.name, categoryName: c.parent?.name ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
