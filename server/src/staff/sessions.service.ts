import { eq, and, isNull, desc } from "drizzle-orm";
import { db } from "../database/client.js";
import { staffSessions, type StaffSession } from "../database/schema/index.js";
import { staffLoginMessage, staffLogoutMessage } from "../bot/services/messageTemplates.js";
import { sendChannelMessage } from "../bot/services/logService.js";
import { getEffectiveChannels } from "../settings/runtimeConfig.service.js";
import { recordAuditLog, AUDIT_ACTIONS } from "../audit/audit.service.js";
import type { AuthenticatedSessionUser } from "../types/session.js";

export class DutyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DutyConflictError";
  }
}

export async function getActiveDutySession(staffUserId: string): Promise<StaffSession | undefined> {
  return db.query.staffSessions.findFirst({
    where: and(eq(staffSessions.staffUserId, staffUserId), eq(staffSessions.status, "ACTIVE")),
  });
}

export async function listOnDutyStaff(): Promise<StaffSession[]> {
  return db.query.staffSessions.findMany({
    where: eq(staffSessions.status, "ACTIVE"),
    orderBy: [desc(staffSessions.loginTime)],
  });
}

export async function listStaffSessionHistory(staffUserId?: string, limit = 100): Promise<StaffSession[]> {
  return db.query.staffSessions.findMany({
    where: staffUserId ? eq(staffSessions.staffUserId, staffUserId) : undefined,
    orderBy: [desc(staffSessions.loginTime)],
    limit,
  });
}

/**
 * Starts a duty session (transactional insert relies on the DB's partial
 * unique index to reject a concurrent duplicate) then posts the fixed-format
 * login message. A Discord send failure never rolls back the duty session —
 * it's recorded in staff_sessions.loginMessageId as null / logged instead.
 */
/** Discord role MENTION only — never the platform permission role — so it renders in the role's own Discord color. Empty when no Discord role has been assigned yet. */
function discordRoleMention(user: Pick<AuthenticatedSessionUser, "discordRoleId">): string {
  return user.discordRoleId ? `<@&${user.discordRoleId}>` : "—";
}

export async function startDuty(
  user: Pick<AuthenticatedSessionUser, "staffId" | "discordUserId" | "displayName" | "roleName" | "discordRoleId">,
): Promise<StaffSession> {
  if (!user.staffId) {
    throw new Error("No staff record is associated with this account yet. Please try logging in again.");
  }

  const existing = await getActiveDutySession(user.discordUserId);
  if (existing) {
    throw new DutyConflictError("You are already on duty.");
  }

  let created: StaffSession;
  try {
    [created] = await db
      .insert(staffSessions)
      .values({
        staffId: user.staffId,
        staffUserId: user.discordUserId,
        staffName: user.displayName,
        staffRole: user.roleName,
        status: "ACTIVE",
      })
      .returning();
  } catch (err: any) {
    if (err?.code === "23505") {
      throw new DutyConflictError("You are already on duty.");
    }
    throw err;
  }

  // The message shows the person's DISCORD role ONLY (never the platform
  // permission role, which stays internal to the dashboard), written as a
  // role mention so Discord renders it in that role's own color.
  const channels = await getEffectiveChannels();
  const result = await sendChannelMessage(
    channels.staffLog,
    await staffLoginMessage({
      staffName: user.displayName,
      staffRole: discordRoleMention(user),
      loginTime: created.loginTime,
    }),
  );

  if (result.status === "SENT" && result.messageId) {
    await db.update(staffSessions).set({ loginMessageId: result.messageId }).where(eq(staffSessions.id, created.id));
  }

  await recordAuditLog({
    actorDiscordId: user.discordUserId,
    actorName: user.displayName,
    action: AUDIT_ACTIONS.STAFF_LOGIN,
    targetType: "staff_session",
    targetId: created.id,
    metadata: { discordLogStatus: result.status, discordLogError: result.error },
  });

  return created;
}

export async function endDuty(
  user: Pick<AuthenticatedSessionUser, "discordUserId" | "displayName" | "roleName" | "discordRoleId">,
  notes?: string | null,
): Promise<StaffSession> {
  const active = await getActiveDutySession(user.discordUserId);
  if (!active) {
    throw new DutyConflictError("You are not currently on duty.");
  }

  const logoutTime = new Date();
  const [updated] = await db
    .update(staffSessions)
    .set({ status: "COMPLETED", logoutTime, notes: notes ?? null })
    .where(and(eq(staffSessions.id, active.id), eq(staffSessions.status, "ACTIVE")))
    .returning();

  if (!updated) {
    throw new DutyConflictError("You are not currently on duty.");
  }

  const channels = await getEffectiveChannels();
  const result = await sendChannelMessage(
    channels.staffLog,
    await staffLogoutMessage({
      staffName: user.displayName,
      staffRole: discordRoleMention(user),
      logoutTime,
      notes,
    }),
  );

  if (result.status === "SENT" && result.messageId) {
    await db.update(staffSessions).set({ logoutMessageId: result.messageId }).where(eq(staffSessions.id, updated.id));
  }

  await recordAuditLog({
    actorDiscordId: user.discordUserId,
    actorName: user.displayName,
    action: AUDIT_ACTIONS.STAFF_LOGOUT,
    targetType: "staff_session",
    targetId: updated.id,
    metadata: { notes, discordLogStatus: result.status, discordLogError: result.error },
  });

  return updated;
}
