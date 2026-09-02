import { ChannelType } from "discord.js";
import { getModerationGuild } from "../client.js";

export interface GuildRoleSummary {
  id: string;
  name: string;
}

export interface GuildMemberSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  roleIds: string[];
  /** Same roles as roleIds, with names resolved — for the Add Staff Discord-role picker. Excludes @everyone. */
  roles: GuildRoleSummary[];
}

function toSummary(member: import("discord.js").GuildMember): GuildMemberSummary {
  const roles = member.roles.cache.filter((r) => r.name !== "@everyone").map((r) => ({ id: r.id, name: r.name }));
  return {
    id: member.id,
    username: member.user.username,
    displayName: member.displayName,
    avatarUrl: member.displayAvatarURL({ size: 64 }),
    roleIds: member.roles.cache.map((r) => r.id),
    roles,
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

export interface RoleChangeResult {
  ok: boolean;
  error?: string;
}

/**
 * Grants/removes a single Discord role on a guild member — used for the
 * configurable "punishment role" applied while a warning/ban is active (see
 * settings/punishmentRoles.service.ts). Never throws: like sendChannelMessage,
 * this is a best-effort Discord side-effect that must never fail the
 * warning/ban action itself.
 */
export async function grantMemberRole(discordUserId: string, roleId: string): Promise<RoleChangeResult> {
  try {
    const guild = await getModerationGuild();
    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) return { ok: false, error: "Member not found in the moderation guild." };
    await member.roles.add(roleId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function revokeMemberRole(discordUserId: string, roleId: string): Promise<RoleChangeResult> {
  try {
    const guild = await getModerationGuild();
    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) return { ok: false, error: "Member not found in the moderation guild." };
    await member.roles.remove(roleId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface GuildTextChannelSummary {
  id: string;
  name: string;
  categoryName: string | null;
}

/** Lists every assignable role in the moderation guild, for the punishment-role picker in Settings. Excludes @everyone and Discord-managed (bot/integration) roles, which can't be manually assigned. */
export async function listGuildRoles(): Promise<GuildRoleSummary[]> {
  const guild = await getModerationGuild();
  const roles = await guild.roles.fetch();
  return roles
    .filter((r) => r.name !== "@everyone" && !r.managed)
    .map((r) => ({ id: r.id, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
