import { eq, and, desc, lte, type SQL } from "drizzle-orm";
import { db } from "../../database/client.js";
import { warnings, warningEvidence, type Warning } from "../../database/schema/index.js";
import { findOrCreatePlayer, findPlayerById, countTotalWarningsForPlayer } from "../players/players.service.js";
import { resolveDuration, type DurationType } from "../duration.js";
import { generateModerationCode } from "../../ids/idGenerator.js";
import { storeEvidenceFiles, type EvidenceFileInput } from "../../evidence/storage.js";
import { sendChannelMessage, sendDirectMessage } from "../../bot/services/logService.js";
import { grantMemberRole, revokeMemberRole } from "../../bot/services/memberService.js";
import {
  warningLogMessage,
  warningRevokedMessage,
  warningPlayerDmMessage,
  managerAlertWarningMessage,
} from "../../bot/services/messageTemplates.js";
import { getEffectiveChannels } from "../../settings/runtimeConfig.service.js";
import { getPunishmentRolesConfig, findWarningRoleRule } from "../../settings/punishmentRoles.service.js";
import { getRevokeNotificationsConfig } from "../../settings/revokeNotifications.service.js";
import { assertOnDuty } from "../dutyGuard.js";
import { findActiveManager } from "../../staff/staff.service.js";
import { recordAuditLog, AUDIT_ACTIONS } from "../../audit/audit.service.js";
import { nowInDisplayZone } from "../../utils/timezone.js";
import type { AuthenticatedSessionUser } from "../../types/session.js";

export interface CreateWarningInput {
  playerDiscordId?: string | null;
  playerDiscordUsername?: string | null;
  fivemIdentifier?: string | null;
  playerName: string;
  warningNumber?: number | null;
  reason: string;
  durationType: DurationType;
  customDurationHours?: number | null;
  evidenceFiles: EvidenceFileInput[];
  idempotencyKey?: string | null;
}

export async function suggestWarningNumber(playerId: string): Promise<{ previousWarnings: number; suggested: number }> {
  const previousWarnings = await countTotalWarningsForPlayer(playerId);
  return { previousWarnings, suggested: previousWarnings + 1 };
}

export async function createWarning(input: CreateWarningInput, actor: AuthenticatedSessionUser): Promise<Warning> {
  // Must be on duty ("دخول الرقابة") to issue a warning — checked first, before any other work.
  await assertOnDuty(actor.discordUserId);

  if (input.idempotencyKey) {
    const existing = await db.query.warnings.findFirst({ where: eq(warnings.idempotencyKey, input.idempotencyKey) });
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

  let warningNumber = input.warningNumber ?? null;
  if (!warningNumber) {
    const suggestion = await suggestWarningNumber(player.id);
    warningNumber = suggestion.suggested;
  }

  // Evidence is a precondition of the record, not the notification step —
  // upload/validate it before writing anything to the database.
  const channels = await getEffectiveChannels();

  // Built before the evidence upload so that, when the Discord storage
  // driver is active, the evidence attaches directly to this announcement
  // message instead of a separate message posted ahead of it.
  const logContent = await warningLogMessage({
    playerDiscordId: player.discordUserId,
    playerName: player.playerName,
    warningNumber,
    reason: input.reason,
    issuedAt,
    durationType,
    durationHours,
    staffName: actor.displayName,
    staffDiscordId: actor.discordUserId,
    staffRole: actor.discordRoleName ?? actor.roleName,
  });

  const { records: evidenceRecords, logResult: combinedLogResult } = await storeEvidenceFiles(input.evidenceFiles, {
    channelId: channels.warningLog,
    content: logContent,
  });

  const warningCode = await generateModerationCode("WRN", nowInDisplayZone().year);

  let created: Warning;
  try {
    created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(warnings)
        .values({
          warningCode,
          playerId: player.id,
          warningNumber,
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

      if (evidenceRecords.length > 0) {
        await tx.insert(warningEvidence).values(
          evidenceRecords.map((e) => ({
            warningId: row.id,
            attachmentId: e.attachmentId,
            attachmentUrl: e.attachmentUrl,
            attachmentType: e.attachmentType,
            filename: e.filename,
          })),
        );
      }

      return row;
    });
  } catch (err: any) {
    if (err?.code === "23505" && input.idempotencyKey) {
      const existing = await db.query.warnings.findFirst({ where: eq(warnings.idempotencyKey, input.idempotencyKey) });
      if (existing) return existing;
    }
    throw err;
  }

  await recordAuditLog({
    actorDiscordId: actor.discordUserId,
    actorName: actor.displayName,
    action: AUDIT_ACTIONS.WARNING_CREATED,
    targetType: "warning",
    targetId: created.id,
    metadata: { warningCode, playerId: player.id, warningNumber, reason: input.reason, durationType },
  });

  // Notification step — allowed to fail without affecting the created
  // record. If the evidence upload already sent the combined
  // announcement+evidence message (Discord storage driver), reuse that
  // result instead of sending a second, redundant message.
  const logResult = combinedLogResult ?? (await sendChannelMessage(channels.warningLog, logContent));

  // Configurable "punishment role" (e.g. "Warning 1") — best-effort, never
  // blocks the warning itself. Only granted when the rule and the player's
  // Discord ID are both known; the exact role ID granted is recorded on the
  // row so it can be removed precisely on revoke/expiry later.
  let punishmentRoleId: string | null = null;
  if (player.discordUserId) {
    const rolesConfig = await getPunishmentRolesConfig();
    const rule = findWarningRoleRule(rolesConfig, warningNumber);
    if (rule) {
      const grant = await grantMemberRole(player.discordUserId, rule.discordRoleId);
      if (grant.ok) {
        punishmentRoleId = rule.discordRoleId;
      } else {
        // Surfaced in Audit Logs (not just server logs) so the failure is
        // diagnosable from the dashboard — common causes: the bot lacks
        // "Manage Roles", or its own highest role sits below this role.
        await recordAuditLog({
          actorDiscordId: actor.discordUserId,
          actorName: actor.displayName,
          action: AUDIT_ACTIONS.PUNISHMENT_ROLE_GRANT_FAILED,
          targetType: "warning",
          targetId: created.id,
          metadata: { discordRoleId: rule.discordRoleId, discordRoleName: rule.discordRoleName, playerDiscordId: player.discordUserId, error: grant.error },
        });
      }
    }
  }

  // Player + Manager notifications — best-effort DMs, never block the warning.
  if (player.discordUserId) {
    await sendDirectMessage(
      player.discordUserId,
      await warningPlayerDmMessage({
        playerName: player.playerName,
        warningNumber,
        reason: input.reason,
        issuedAt,
        durationType,
        durationHours,
      }),
    );
  }
  const manager = await findActiveManager();
  if (manager && manager.discordUserId !== actor.discordUserId) {
    await sendDirectMessage(
      manager.discordUserId,
      await managerAlertWarningMessage({
        playerDiscordId: player.discordUserId,
        playerName: player.playerName,
        warningNumber,
        reason: input.reason,
        staffDiscordId: actor.discordUserId,
        staffName: actor.displayName,
      }),
    );
  }

  const [updated] = await db
    .update(warnings)
    .set({
      discordLogStatus: logResult.status,
      discordMessageId: logResult.messageId ?? null,
      punishmentRoleId,
      updatedAt: new Date(),
    })
    .where(eq(warnings.id, created.id))
    .returning();

  return updated;
}

export interface RevokeWarningInput {
  warningId: string;
  reason: string;
  actor: Pick<AuthenticatedSessionUser, "discordUserId" | "displayName" | "staffId" | "roleName" | "discordRoleName">;
}

export async function revokeWarning(input: RevokeWarningInput): Promise<Warning> {
  const existing = await db.query.warnings.findFirst({ where: eq(warnings.id, input.warningId) });
  if (!existing) throw new Error("Warning not found");
  if (existing.status === "REVOKED") throw new Error("Warning is already revoked");

  const [updated] = await db
    .update(warnings)
    .set({
      status: "REVOKED",
      revokedByStaffId: input.actor.staffId,
      revokedReason: input.reason,
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(warnings.id, input.warningId))
    .returning();

  await recordAuditLog({
    actorDiscordId: input.actor.discordUserId,
    actorName: input.actor.displayName,
    action: AUDIT_ACTIONS.WARNING_REVOKED,
    targetType: "warning",
    targetId: input.warningId,
    metadata: { reason: input.reason, warningCode: existing.warningCode },
  });

  const player = await findPlayerById(existing.playerId);

  if (existing.punishmentRoleId && player?.discordUserId) {
    await revokeMemberRole(player.discordUserId, existing.punishmentRoleId);
  }

  // Notification step — toggleable in Settings, and allowed to fail without affecting the revocation itself.
  const revokeNotifications = await getRevokeNotificationsConfig();
  if (revokeNotifications.warningEnabled) {
    const channels = await getEffectiveChannels();
    await sendChannelMessage(
      channels.warningLog,
      await warningRevokedMessage({
        playerDiscordId: player?.discordUserId ?? null,
        playerName: player?.playerName ?? "Unknown",
        warningNumber: existing.warningNumber,
        revokeReason: input.reason,
        revokedAt: updated.revokedAt ?? new Date(),
        staffDiscordId: input.actor.discordUserId,
        staffName: input.actor.displayName,
        staffRole: input.actor.discordRoleName ?? input.actor.roleName,
      }),
    );
  }

  return updated;
}

export interface WarningFilters {
  status?: "ACTIVE" | "EXPIRED" | "REVOKED";
  playerId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export async function listWarnings(filters: WarningFilters): Promise<Warning[]> {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(warnings.status, filters.status));
  if (filters.playerId) conditions.push(eq(warnings.playerId, filters.playerId));

  return db.query.warnings.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [desc(warnings.issuedAt)],
    limit: filters.limit ?? 100,
    offset: filters.offset ?? 0,
  });
}

export async function getWarningById(id: string): Promise<Warning | undefined> {
  return db.query.warnings.findFirst({ where: eq(warnings.id, id) });
}

export async function getWarningEvidence(warningId: string) {
  return db.query.warningEvidence.findMany({ where: eq(warningEvidence.warningId, warningId) });
}

/** Server-side, DB-driven expiration sweep — never relies on setTimeout(). */
export async function expireOverdueWarnings(): Promise<Warning[]> {
  const now = new Date();
  const expired = await db
    .update(warnings)
    .set({ status: "EXPIRED", updatedAt: now })
    .where(and(eq(warnings.status, "ACTIVE"), lte(warnings.expiresAt, now)))
    .returning();

  for (const warning of expired) {
    await recordAuditLog({
      action: AUDIT_ACTIONS.WARNING_EXPIRED,
      targetType: "warning",
      targetId: warning.id,
      metadata: { warningCode: warning.warningCode },
    });

    if (warning.punishmentRoleId) {
      const player = await findPlayerById(warning.playerId);
      if (player?.discordUserId) await revokeMemberRole(player.discordUserId, warning.punishmentRoleId);
    }
  }

  return expired;
}
