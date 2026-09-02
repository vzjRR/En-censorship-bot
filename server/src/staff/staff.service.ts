import { eq, and, isNull } from "drizzle-orm";
import { db } from "../database/client.js";
import { staffMembers, staffRoles, type StaffMember } from "../database/schema/index.js";
import { recordAuditLog, AUDIT_ACTIONS } from "../audit/audit.service.js";
import { ensurePlatformOwnerRole } from "./roles.service.js";

export interface StaffMemberWithRole extends StaffMember {
  role: {
    id: string;
    key: string;
    name: string;
    rank: number;
    permissions: string[];
    requiredDiscordRoleId: string | null;
  };
}

async function attachRole(member: StaffMember): Promise<StaffMemberWithRole> {
  const role = await db.query.staffRoles.findFirst({ where: eq(staffRoles.id, member.roleId) });
  if (!role) throw new Error(`Staff member ${member.id} references a missing role ${member.roleId}`);
  return {
    ...member,
    role: {
      id: role.id,
      key: role.key,
      name: role.name,
      rank: role.rank,
      permissions: role.permissions,
      requiredDiscordRoleId: role.requiredDiscordRoleId,
    },
  };
}

export async function findActiveStaffByDiscordId(discordUserId: string): Promise<StaffMemberWithRole | null> {
  const member = await db.query.staffMembers.findFirst({
    where: and(eq(staffMembers.discordUserId, discordUserId), eq(staffMembers.status, "ACTIVE")),
  });
  if (!member) return null;
  return attachRole(member);
}

export async function findStaffByDiscordId(discordUserId: string): Promise<StaffMemberWithRole | null> {
  const member = await db.query.staffMembers.findFirst({
    where: eq(staffMembers.discordUserId, discordUserId),
  });
  if (!member) return null;
  return attachRole(member);
}

export async function findStaffById(id: string): Promise<StaffMemberWithRole | null> {
  const member = await db.query.staffMembers.findFirst({ where: eq(staffMembers.id, id) });
  if (!member) return null;
  return attachRole(member);
}

export async function listStaffMembers(): Promise<StaffMemberWithRole[]> {
  const members = await db.query.staffMembers.findMany({ orderBy: (m, { asc }) => [asc(m.displayName)] });
  return Promise.all(members.map(attachRole));
}

export interface AddStaffInput {
  discordUserId: string;
  discordUsername: string;
  displayName: string;
  roleId: string;
  discordRoleIds: string[];
  addedByDiscordId: string;
  addedByName: string;
}

export async function addStaffMember(input: AddStaffInput): Promise<StaffMemberWithRole> {
  const existing = await db.query.staffMembers.findFirst({
    where: eq(staffMembers.discordUserId, input.discordUserId),
  });
  if (existing) {
    throw new Error("This Discord member is already a staff member.");
  }

  const [member] = await db
    .insert(staffMembers)
    .values({
      discordUserId: input.discordUserId,
      discordUsername: input.discordUsername,
      displayName: input.displayName,
      roleId: input.roleId,
      discordRoleIds: input.discordRoleIds,
      status: "ACTIVE",
      addedByDiscordId: input.addedByDiscordId,
      lastRoleSyncAt: new Date(),
    })
    .returning();

  await recordAuditLog({
    actorDiscordId: input.addedByDiscordId,
    actorName: input.addedByName,
    action: AUDIT_ACTIONS.STAFF_ADDED,
    targetType: "staff_member",
    targetId: member.id,
    metadata: { discordUserId: input.discordUserId, roleId: input.roleId },
  });

  return attachRole(member);
}

export interface UpdateStaffInput {
  displayName?: string;
  status?: "ACTIVE" | "INACTIVE";
}

export async function updateStaffMember(
  id: string,
  input: UpdateStaffInput,
  actor: { discordId: string; name: string },
): Promise<StaffMemberWithRole> {
  const [member] = await db
    .update(staffMembers)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(staffMembers.id, id))
    .returning();
  if (!member) throw new Error("Staff member not found");

  await recordAuditLog({
    actorDiscordId: actor.discordId,
    actorName: actor.name,
    action: AUDIT_ACTIONS.STAFF_UPDATED,
    targetType: "staff_member",
    targetId: member.id,
    metadata: { ...input },
  });

  return attachRole(member);
}

export async function changeStaffRole(
  id: string,
  newRoleId: string,
  actor: { discordId: string; name: string },
): Promise<StaffMemberWithRole> {
  const before = await findStaffById(id);
  if (!before) throw new Error("Staff member not found");

  const [member] = await db
    .update(staffMembers)
    .set({ roleId: newRoleId, updatedAt: new Date() })
    .where(eq(staffMembers.id, id))
    .returning();

  await recordAuditLog({
    actorDiscordId: actor.discordId,
    actorName: actor.name,
    action: AUDIT_ACTIONS.STAFF_ROLE_CHANGED,
    targetType: "staff_member",
    targetId: id,
    metadata: { fromRoleId: before.roleId, toRoleId: newRoleId },
  });

  return attachRole(member);
}

/** Soft-remove: deactivates rather than deleting, preserving the audit trail. */
export async function removeStaffMember(id: string, actor: { discordId: string; name: string }): Promise<void> {
  const [member] = await db
    .update(staffMembers)
    .set({ status: "INACTIVE", updatedAt: new Date() })
    .where(eq(staffMembers.id, id))
    .returning();
  if (!member) throw new Error("Staff member not found");

  await recordAuditLog({
    actorDiscordId: actor.discordId,
    actorName: actor.name,
    action: AUDIT_ACTIONS.STAFF_REMOVED,
    targetType: "staff_member",
    targetId: id,
    metadata: { discordUserId: member.discordUserId },
  });
}

export async function syncStaffDiscordRoles(id: string, discordRoleIds: string[]): Promise<void> {
  await db
    .update(staffMembers)
    .set({ discordRoleIds, lastRoleSyncAt: new Date(), updatedAt: new Date() })
    .where(eq(staffMembers.id, id));
}

/**
 * Ensures the Platform Owner has a staff_members row so features like duty
 * sessions (which FK to staff_members.id) work uniformly for the owner too.
 * This is bookkeeping only — it never gates access (see auth/authorization).
 * Failures here are caught by the caller so a broken staff table can never
 * block the owner from logging in.
 */
export async function ensurePlatformOwnerStaffRecord(params: {
  discordUserId: string;
  discordUsername: string;
  displayName: string;
}): Promise<StaffMemberWithRole> {
  const ownerRole = await ensurePlatformOwnerRole();

  const existing = await db.query.staffMembers.findFirst({
    where: eq(staffMembers.discordUserId, params.discordUserId),
  });

  if (existing) {
    if (existing.status !== "ACTIVE" || existing.roleId !== ownerRole.id) {
      const [updated] = await db
        .update(staffMembers)
        .set({ status: "ACTIVE", roleId: ownerRole.id, updatedAt: new Date() })
        .where(eq(staffMembers.id, existing.id))
        .returning();
      return attachRole(updated);
    }
    return attachRole(existing);
  }

  const [created] = await db
    .insert(staffMembers)
    .values({
      discordUserId: params.discordUserId,
      discordUsername: params.discordUsername,
      displayName: params.displayName,
      roleId: ownerRole.id,
      status: "ACTIVE",
      addedByDiscordId: params.discordUserId,
      lastRoleSyncAt: new Date(),
    })
    .returning();

  return attachRole(created);
}

export async function listOrphanedStaff(): Promise<StaffMemberWithRole[]> {
  const members = await db.query.staffMembers.findMany({
    where: and(eq(staffMembers.status, "ACTIVE"), isNull(staffMembers.lastRoleSyncAt)),
  });
  return Promise.all(members.map(attachRole));
}
