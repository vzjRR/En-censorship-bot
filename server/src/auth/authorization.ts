import { sql } from "drizzle-orm";
import { db } from "../database/client.js";
import { users } from "../database/schema/index.js";
import { discordConfig } from "../config/discordConfig.js";
import { fetchGuildMember, type GuildMemberSummary } from "../bot/services/memberService.js";
import { findActiveStaffByDiscordId, syncStaffDiscordRoles, ensurePlatformOwnerStaffRecord } from "../staff/staff.service.js";
import { ALL_PERMISSIONS, type Permission } from "./permissions.js";
import type { DiscordOAuthProfile } from "./discordOAuth.js";
import type { AuthenticatedSessionUser } from "../types/session.js";

export type AccessDenialReason = "not_guild_member" | "not_staff" | "discord_role_missing" | "bot_unavailable";

export type AccessResult =
  | { status: "authorized"; user: AuthenticatedSessionUser }
  | { status: "denied"; reason: AccessDenialReason; message: string };

async function upsertUserRecord(profile: DiscordOAuthProfile, ipAddress: string | null): Promise<void> {
  await db
    .insert(users)
    .values({
      discordUserId: profile.id,
      username: profile.username,
      globalName: profile.global_name,
      avatarHash: profile.avatar,
      lastLoginIp: ipAddress,
    })
    .onConflictDoUpdate({
      target: users.discordUserId,
      set: {
        username: profile.username,
        globalName: profile.global_name,
        avatarHash: profile.avatar,
        lastLoginAt: sql`now()`,
        lastLoginIp: ipAddress,
      },
    });
}

/**
 * Central, server-side authorization decision for Discord OAuth logins.
 * The Platform Owner (PLATFORM_OWNER_ID) always gets full access — this is
 * enforced here, never on the frontend, and does not depend on the staff
 * database being consistent (per platform requirement: owner access must
 * survive staff-table errors).
 */
export async function resolveAccess(profile: DiscordOAuthProfile, ipAddress: string | null): Promise<AccessResult> {
  await upsertUserRecord(profile, ipAddress);

  const isPlatformOwner = profile.id === discordConfig.platformOwnerId;

  let guildMember: GuildMemberSummary | null = null;
  try {
    guildMember = await fetchGuildMember(profile.id);
  } catch (err) {
    console.error("[auth] failed to fetch guild member during login:", err);
    if (!isPlatformOwner) {
      return { status: "denied", reason: "bot_unavailable", message: "Could not verify Discord membership right now. Try again shortly." };
    }
  }

  const displayName = guildMember?.displayName ?? profile.global_name ?? profile.username;
  const avatarHash = guildMember?.avatarUrl ? profile.avatar : profile.avatar;
  const discordRoleIds = guildMember?.roleIds ?? [];

  if (isPlatformOwner) {
    let staffId: string | null = null;
    let discordRoleName: string | null = null;
    let discordRoleId: string | null = null;
    try {
      const ownerRecord = await ensurePlatformOwnerStaffRecord({
        discordUserId: profile.id,
        discordUsername: profile.username,
        displayName,
      });
      staffId = ownerRecord.id;
      discordRoleName = ownerRecord.discordRoleName;
      discordRoleId = ownerRecord.discordRoleId;
      if (discordRoleIds.length) await syncStaffDiscordRoles(ownerRecord.id, discordRoleIds);
    } catch (err) {
      // Bookkeeping only — the owner still gets full access even if the
      // staff table is broken or unreachable.
      console.error("[auth] failed to provision platform owner staff record:", err);
    }

    const user: AuthenticatedSessionUser = {
      discordUserId: profile.id,
      discordUsername: profile.username,
      displayName,
      avatarHash,
      isPlatformOwner: true,
      staffId,
      roleKey: "platform_owner",
      roleName: "Platform Owner",
      permissions: ALL_PERMISSIONS as Permission[],
      discordRoleIds,
      discordRoleName,
      discordRoleId,
      rolesSyncedAt: new Date().toISOString(),
    };
    return { status: "authorized", user };
  }

  if (!guildMember) {
    return { status: "denied", reason: "not_guild_member", message: "You are not a member of the ENCLAVE RP Discord server." };
  }

  const staff = await findActiveStaffByDiscordId(profile.id);
  if (!staff) {
    return { status: "denied", reason: "not_staff", message: "Your Discord account does not have moderation access." };
  }

  if (staff.role.requiredDiscordRoleId && !discordRoleIds.includes(staff.role.requiredDiscordRoleId)) {
    return {
      status: "denied",
      reason: "discord_role_missing",
      message: `Your account is registered as staff, but you no longer hold the required Discord role for "${staff.role.name}". Access has been suspended until the role is restored.`,
    };
  }

  await syncStaffDiscordRoles(staff.id, discordRoleIds);

  const user: AuthenticatedSessionUser = {
    discordUserId: profile.id,
    discordUsername: profile.username,
    displayName: staff.displayName || displayName,
    avatarHash,
    isPlatformOwner: false,
    staffId: staff.id,
    roleKey: staff.role.key,
    roleName: staff.role.name,
    permissions: staff.role.permissions as Permission[],
    discordRoleIds,
    discordRoleName: staff.discordRoleName,
    discordRoleId: staff.discordRoleId,
    rolesSyncedAt: new Date().toISOString(),
  };
  return { status: "authorized", user };
}

export function hasPermission(user: AuthenticatedSessionUser, permission: Permission): boolean {
  if (user.isPlatformOwner) return true;
  return user.permissions.includes(permission);
}
