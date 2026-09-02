import { eq, and, desc, lte, type SQL } from "drizzle-orm";
import { db } from "../../database/client.js";
import { warnings, warningEvidence, type Warning } from "../../database/schema/index.js";
import { findOrCreatePlayer, countTotalWarningsForPlayer } from "../players/players.service.js";
import { resolveDuration, type DurationType } from "../duration.js";
import { generateModerationCode } from "../../ids/idGenerator.js";
import { storeEvidenceFiles, type EvidenceFileInput } from "../../evidence/storage.js";
import { sendChannelMessage } from "../../bot/services/logService.js";
import { warningLogMessage } from "../../bot/services/messageTemplates.js";
import { discordConfig } from "../../config/discordConfig.js";
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
  const evidenceRecords = await storeEvidenceFiles(input.evidenceFiles, {
    channelId: discordConfig.channels.warningLog,
    caption: `Evidence for warning #${warningNumber} — ${player.playerName}`,
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

  // Notification step — allowed to fail without affecting the created record.
  const logResult = await sendChannelMessage(
    discordConfig.channels.warningLog,
    warningLogMessage({
      playerDiscordId: player.discordUserId,
      playerName: player.playerName,
      warningNumber,
      reason: input.reason,
      issuedAt,
      durationType,
      durationHours,
      staffName: actor.displayName,
    }),
  );

  const [updated] = await db
    .update(warnings)
    .set({
      discordLogStatus: logResult.status,
      discordMessageId: logResult.messageId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(warnings.id, created.id))
    .returning();

  return updated;
}

export interface RevokeWarningInput {
  warningId: string;
  reason: string;
  actor: Pick<AuthenticatedSessionUser, "discordUserId" | "displayName" | "staffId">;
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
  }

  return expired;
}
