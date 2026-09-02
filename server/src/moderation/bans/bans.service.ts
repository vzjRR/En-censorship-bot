import { eq, and, desc, lte, type SQL } from "drizzle-orm";
import { db } from "../../database/client.js";
import { bans, banEvidence, type Ban } from "../../database/schema/index.js";
import { findOrCreatePlayer } from "../players/players.service.js";
import { resolveDuration, type DurationType } from "../duration.js";
import { generateModerationCode } from "../../ids/idGenerator.js";
import { storeEvidenceFiles, type EvidenceFileInput } from "../../evidence/storage.js";
import { sendChannelMessage } from "../../bot/services/logService.js";
import { grantMemberRole, revokeMemberRole } from "../../bot/services/memberService.js";
import { banLogMessage, banRevokedMessage } from "../../bot/services/messageTemplates.js";
import { getEffectiveChannels } from "../../settings/runtimeConfig.service.js";
import { getPunishmentRolesConfig } from "../../settings/punishmentRoles.service.js";
import { assertOnDuty } from "../dutyGuard.js";
import { recordAuditLog, AUDIT_ACTIONS } from "../../audit/audit.service.js";
import { nowInDisplayZone } from "../../utils/timezone.js";
import type { AuthenticatedSessionUser } from "../../types/session.js";

export class BanValidationError extends Error {}

export interface CreateBanInput {
  playerDiscordId?: string | null;
  playerDiscordUsername?: string | null;
  fivemIdentifier?: string | null;
  playerName: string;
  reason: string;
  durationType: DurationType;
  customDurationHours?: number | null;
  evidenceFiles: EvidenceFileInput[];
  idempotencyKey?: string | null;
}

export async function createBan(input: CreateBanInput, actor: AuthenticatedSessionUser): Promise<Ban> {
  // Must be on duty ("دخول الرقابة") to issue a ban — checked first, before any other work.
  await assertOnDuty(actor.discordUserId);

  // Ban evidence is mandatory — enforced server-side, never trusting the
  // frontend's disabled-button UX alone.
  if (!input.evidenceFiles || input.evidenceFiles.length === 0) {
    throw new BanValidationError("Evidence is required before issuing a ban.");
  }

  if (input.idempotencyKey) {
    const existing = await db.query.bans.findFirst({ where: eq(bans.idempotencyKey, input.idempotencyKey) });
    if (existing) return existing;
  }

  const player = await findOrCreatePlayer({
    discordUserId: input.playerDiscordId,
    discordUsername: input.playerDiscordUsername,
    fivemIdentifier: input.fivemIdentifier,
    playerName: input.playerName,
  });

  const issuedAt = new Date();
  const { durationType, durationHours, expiresAt } = resolveDuration(input.durationType, issuedAt, input.customDurationHours);

  const channels = await getEffectiveChannels();

  // Built before the evidence upload so that, when the Discord storage
  // driver is active, the evidence attaches directly to this announcement
  // message instead of a separate message posted ahead of it.
  const logContent = await banLogMessage({
    fivemIdentifier: input.fivemIdentifier,
    playerDiscordId: player.discordUserId,
    playerName: player.playerName,
    reason: input.reason,
    issuedAt,
    durationType,
    durationHours,
    staffDiscordId: actor.discordUserId,
    staffName: actor.displayName,
    staffRole: actor.discordRoleName ?? actor.roleName,
  });

  const { records: evidenceRecords, logResult: combinedLogResult } = await storeEvidenceFiles(input.evidenceFiles, {
    channelId: channels.banLog,
    content: logContent,
  });

  const banCode = await generateModerationCode("BAN", nowInDisplayZone().year);

  let created: Ban;
  try {
    created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(bans)
        .values({
          banCode,
          playerId: player.id,
          fivemIdentifier: input.fivemIdentifier ?? null,
          discordUserId: player.discordUserId,
          playerName: player.playerName,
          reason: input.reason,
          durationType,
          durationHours,
          issuedAt,
          expiresAt,
          status: "ACTIVE",
          issuedByStaffId: actor.staffId!,
          issuedByName: actor.displayName,
          idempotencyKey: input.idempotencyKey ?? null,
        })
        .returning();

      await tx.insert(banEvidence).values(
        evidenceRecords.map((e) => ({
          banId: row.id,
          attachmentId: e.attachmentId,
          attachmentUrl: e.attachmentUrl,
          attachmentType: e.attachmentType,
          filename: e.filename,
        })),
      );

      return row;
    });
  } catch (err: any) {
    if (err?.code === "23505" && input.idempotencyKey) {
      const existing = await db.query.bans.findFirst({ where: eq(bans.idempotencyKey, input.idempotencyKey) });
      if (existing) return existing;
    }
    throw err;
  }

  await recordAuditLog({
    actorDiscordId: actor.discordUserId,
    actorName: actor.displayName,
    action: AUDIT_ACTIONS.BAN_CREATED,
    targetType: "ban",
    targetId: created.id,
    metadata: { banCode, playerId: player.id, reason: input.reason, durationType },
  });

  // If the evidence upload already sent the combined announcement+evidence
  // message (Discord storage driver), reuse that result instead of sending
  // a second, redundant message.
  const logResult = combinedLogResult ?? (await sendChannelMessage(channels.banLog, logContent));

  // Configurable "punishment role" (e.g. "Banned") — best-effort, never
  // blocks the ban itself. The exact role ID granted is recorded on the row
  // so it can be removed precisely on revoke/expiry later.
  let punishmentRoleId: string | null = null;
  if (player.discordUserId) {
    const rolesConfig = await getPunishmentRolesConfig();
    if (rolesConfig.banRole) {
      const grant = await grantMemberRole(player.discordUserId, rolesConfig.banRole.discordRoleId);
      if (grant.ok) punishmentRoleId = rolesConfig.banRole.discordRoleId;
    }
  }

  const [updated] = await db
    .update(bans)
    .set({
      discordLogStatus: logResult.status,
      discordMessageId: logResult.messageId ?? null,
      punishmentRoleId,
      updatedAt: new Date(),
    })
    .where(eq(bans.id, created.id))
    .returning();

  return updated;
}

export interface RevokeBanInput {
  banId: string;
  reason: string;
  actor: Pick<AuthenticatedSessionUser, "discordUserId" | "displayName" | "staffId" | "roleName" | "discordRoleName">;
}

export async function revokeBan(input: RevokeBanInput): Promise<Ban> {
  const existing = await db.query.bans.findFirst({ where: eq(bans.id, input.banId) });
  if (!existing) throw new Error("Ban not found");
  if (existing.status === "REVOKED") throw new Error("Ban is already revoked");

  const [updated] = await db
    .update(bans)
    .set({
      status: "REVOKED",
      revokedByStaffId: input.actor.staffId,
      revokedReason: input.reason,
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(bans.id, input.banId))
    .returning();

  await recordAuditLog({
    actorDiscordId: input.actor.discordUserId,
    actorName: input.actor.displayName,
    action: AUDIT_ACTIONS.BAN_REVOKED,
    targetType: "ban",
    targetId: input.banId,
    metadata: { reason: input.reason, banCode: existing.banCode },
  });

  if (existing.punishmentRoleId && existing.discordUserId) {
    await revokeMemberRole(existing.discordUserId, existing.punishmentRoleId);
  }

  // Notification step — allowed to fail without affecting the revocation itself.
  const channels = await getEffectiveChannels();
  await sendChannelMessage(
    channels.banLog,
    await banRevokedMessage({
      playerDiscordId: existing.discordUserId,
      playerName: existing.playerName,
      revokeReason: input.reason,
      revokedAt: updated.revokedAt ?? new Date(),
      staffDiscordId: input.actor.discordUserId,
      staffName: input.actor.displayName,
      staffRole: input.actor.discordRoleName ?? input.actor.roleName,
    }),
  );

  return updated;
}

export interface BanFilters {
  status?: "ACTIVE" | "EXPIRED" | "REVOKED";
  playerId?: string;
  limit?: number;
  offset?: number;
}

export async function listBans(filters: BanFilters): Promise<Ban[]> {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(bans.status, filters.status));
  if (filters.playerId) conditions.push(eq(bans.playerId, filters.playerId));

  return db.query.bans.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [desc(bans.issuedAt)],
    limit: filters.limit ?? 100,
    offset: filters.offset ?? 0,
  });
}

export async function getBanById(id: string): Promise<Ban | undefined> {
  return db.query.bans.findFirst({ where: eq(bans.id, id) });
}

export async function getBanEvidence(banId: string) {
  return db.query.banEvidence.findMany({ where: eq(banEvidence.banId, banId) });
}

/** Server-side, DB-driven expiration sweep — never relies on setTimeout(). Permanent bans (expiresAt = null) are never touched. */
export async function expireOverdueBans(): Promise<Ban[]> {
  const now = new Date();
  const expired = await db
    .update(bans)
    .set({ status: "EXPIRED", updatedAt: now })
    .where(and(eq(bans.status, "ACTIVE"), lte(bans.expiresAt, now)))
    .returning();

  for (const ban of expired) {
    await recordAuditLog({
      action: AUDIT_ACTIONS.BAN_EXPIRED,
      targetType: "ban",
      targetId: ban.id,
      metadata: { banCode: ban.banCode },
    });

    if (ban.punishmentRoleId && ban.discordUserId) {
      await revokeMemberRole(ban.discordUserId, ban.punishmentRoleId);
    }
  }

  return expired;
}
