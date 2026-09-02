import request from "supertest";
import { createApp } from "../src/api/app.js";
import { db } from "../src/database/client.js";
import { staffRoles, staffMembers } from "../src/database/schema/index.js";
import { DEFAULT_ROLE_SEEDS, PLATFORM_OWNER_ROLE_KEY, ALL_PERMISSIONS } from "../src/auth/permissions.js";
import type { AuthenticatedSessionUser } from "../src/types/session.js";

export function buildApp() {
  return createApp();
}

export async function seedDefaultRoles(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const seed of DEFAULT_ROLE_SEEDS) {
    const [row] = await db
      .insert(staffRoles)
      .values({ key: seed.key, name: seed.name, rank: seed.rank, permissions: seed.permissions, isSystem: seed.isSystem })
      .returning();
    ids[seed.key] = row.id;
  }
  return ids;
}

export async function seedOwnerRole(): Promise<string> {
  const [row] = await db
    .insert(staffRoles)
    .values({ key: PLATFORM_OWNER_ROLE_KEY, name: "Platform Owner", rank: 0, permissions: ALL_PERMISSIONS, isSystem: true })
    .returning();
  return row.id;
}

let discordIdCounter = 900000000000000001n;
export function nextDiscordId(): string {
  const id = discordIdCounter.toString();
  discordIdCounter += 1n;
  return id;
}

export async function createStaffMember(roleId: string, overrides: Partial<typeof staffMembers.$inferInsert> = {}) {
  const discordUserId = overrides.discordUserId ?? nextDiscordId();
  const [row] = await db
    .insert(staffMembers)
    .values({
      discordUserId,
      discordUsername: overrides.discordUsername ?? `user_${discordUserId}`,
      displayName: overrides.displayName ?? `Tester ${discordUserId}`,
      roleId,
      discordRoleIds: [],
      status: "ACTIVE",
      addedByDiscordId: "000000000000000001",
      lastRoleSyncAt: new Date(),
      ...overrides,
    })
    .returning();
  return row;
}

export function sessionUserFor(
  staff: { id: string; discordUserId: string; displayName: string },
  roleKey: string,
  roleName: string,
  permissions: string[],
  isPlatformOwner = false,
): AuthenticatedSessionUser {
  return {
    discordUserId: staff.discordUserId,
    discordUsername: staff.displayName,
    displayName: staff.displayName,
    avatarHash: null,
    isPlatformOwner,
    staffId: staff.id,
    roleKey,
    roleName,
    permissions,
    discordRoleIds: [],
    rolesSyncedAt: new Date().toISOString(),
  };
}

/** Logs an agent in via the test-only session backdoor and returns its CSRF token. */
export async function loginAs(agent: ReturnType<typeof request.agent>, user: AuthenticatedSessionUser): Promise<string> {
  const res = await agent.post("/api/__test__/set-session").send({ user }).expect(200);
  return res.body.csrfToken as string;
}
