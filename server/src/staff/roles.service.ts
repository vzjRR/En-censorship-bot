import { eq, asc } from "drizzle-orm";
import { db } from "../database/client.js";
import { staffRoles, type StaffRole } from "../database/schema/index.js";
import { ALL_PERMISSIONS, PLATFORM_OWNER_ROLE_KEY, type Permission } from "../auth/permissions.js";

export function listStaffRoles(): Promise<StaffRole[]> {
  return db.query.staffRoles.findMany({ orderBy: [asc(staffRoles.rank)] });
}

export function getStaffRoleById(id: string): Promise<StaffRole | undefined> {
  return db.query.staffRoles.findFirst({ where: eq(staffRoles.id, id) });
}

export function getStaffRoleByKey(key: string): Promise<StaffRole | undefined> {
  return db.query.staffRoles.findFirst({ where: eq(staffRoles.key, key) });
}

export interface CreateRoleInput {
  key: string;
  name: string;
  rank: number;
  permissions: Permission[];
  requiredDiscordRoleId?: string | null;
}

export async function createStaffRole(input: CreateRoleInput): Promise<StaffRole> {
  const [role] = await db
    .insert(staffRoles)
    .values({
      key: input.key,
      name: input.name,
      rank: input.rank,
      permissions: input.permissions,
      requiredDiscordRoleId: input.requiredDiscordRoleId ?? null,
      isSystem: false,
    })
    .returning();
  return role;
}

export interface UpdateRoleInput {
  name?: string;
  rank?: number;
  permissions?: Permission[];
  requiredDiscordRoleId?: string | null;
}

export async function updateStaffRole(id: string, input: UpdateRoleInput): Promise<StaffRole> {
  const [role] = await db
    .update(staffRoles)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(staffRoles.id, id))
    .returning();
  if (!role) throw new Error("Staff role not found");
  return role;
}

/**
 * Idempotently ensures the reserved "Platform Owner" bookkeeping role
 * exists. This role is never used for authorization decisions (the owner
 * always has implicit full access via PLATFORM_OWNER_ID, see
 * auth/authorization.ts) — it only exists so the owner can appear in the
 * Staff list and hold staff_sessions rows like everyone else.
 */
export async function ensurePlatformOwnerRole(): Promise<StaffRole> {
  const existing = await getStaffRoleByKey(PLATFORM_OWNER_ROLE_KEY);
  if (existing) return existing;

  const [role] = await db
    .insert(staffRoles)
    .values({
      key: PLATFORM_OWNER_ROLE_KEY,
      name: "Platform Owner",
      rank: 0,
      permissions: ALL_PERMISSIONS,
      isSystem: true,
    })
    .onConflictDoNothing({ target: staffRoles.key })
    .returning();

  if (role) return role;
  // Lost a race with a concurrent call — fetch what the winner inserted.
  const winner = await getStaffRoleByKey(PLATFORM_OWNER_ROLE_KEY);
  if (!winner) throw new Error("Failed to ensure platform owner role");
  return winner;
}

export async function deleteStaffRole(id: string): Promise<void> {
  const role = await getStaffRoleById(id);
  if (!role) throw new Error("Staff role not found");
  if (role.isSystem) throw new Error("System roles cannot be deleted");
  await db.delete(staffRoles).where(eq(staffRoles.id, id));
}
