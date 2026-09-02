import { eq } from "drizzle-orm";
import { db } from "../database/client.js";
import {
  warnings,
  bans,
  players,
  staffMembers,
  staffSessions,
  auditLogs,
  systemSettings,
  idCounters,
} from "../database/schema/index.js";
import { getTestModeStatus, disableTestMode } from "./testMode.service.js";

export class DataWipeError extends Error {}

export const WIPE_CATEGORIES = [
  "warnings",
  "bans",
  "players",
  "staff_members",
  "staff_sessions",
  "audit_logs",
  "settings",
] as const;

export type WipeCategory = (typeof WIPE_CATEGORIES)[number];

export const WIPE_CATEGORY_LABELS: Record<WipeCategory, string> = {
  warnings: "Warnings (and their evidence)",
  bans: "Bans (and their evidence)",
  players: "Player records",
  staff_members: "Staff roster (staff members and their Discord role assignments)",
  staff_sessions: "Staff duty session history (on-duty logs)",
  audit_logs: "Audit logs",
  settings: "Settings (message templates, channel routing, and Test Mode configuration)",
};

/**
 * Categories that reference warnings/bans with a restrictive foreign key
 * (issued_by_staff_id, revoked_by_staff_id, player_id) — wiping them without
 * also wiping warnings and bans would fail at the database level, so we
 * require the dependency to be selected explicitly rather than silently
 * cascading extra deletes the owner didn't ask for.
 */
const WIPE_DEPENDENCIES: Partial<Record<WipeCategory, WipeCategory[]>> = {
  players: ["warnings", "bans"],
  staff_members: ["warnings", "bans"],
};

// Fixed, dependency-safe deletion order — independent of the order categories were selected in.
const WIPE_ORDER: WipeCategory[] = ["warnings", "bans", "players", "staff_sessions", "staff_members", "audit_logs", "settings"];

export interface WipeDataInput {
  categories: WipeCategory[];
  actor: { discordId: string; name: string };
}

export interface WipeDataResult {
  categories: WipeCategory[];
  rowsDeleted: Partial<Record<WipeCategory, number>>;
  testModeCleanupErrors: string[];
}

export function validateWipeSelection(categories: WipeCategory[]): void {
  if (categories.length === 0) {
    throw new DataWipeError("Select at least one data category to wipe.");
  }
  const invalid = categories.filter((c) => !WIPE_CATEGORIES.includes(c));
  if (invalid.length > 0) {
    throw new DataWipeError(`Unknown data category: ${invalid.join(", ")}`);
  }
  const selected = new Set(categories);
  for (const category of categories) {
    const deps = WIPE_DEPENDENCIES[category];
    if (!deps) continue;
    const missing = deps.filter((dep) => !selected.has(dep));
    if (missing.length > 0) {
      throw new DataWipeError(
        `To wipe "${WIPE_CATEGORY_LABELS[category]}", also select: ${missing.map((m) => WIPE_CATEGORY_LABELS[m]).join(", ")} (records there reference it and cannot be left dangling).`,
      );
    }
  }
}

/**
 * Owner-only, explicit, hard-delete data wipe — the one deliberate exception
 * to the platform's normal "never hard-delete" rule. Deletes are performed
 * in a fixed dependency-safe order inside a single transaction; the summary
 * audit log entry recording the wipe is written AFTER the transaction
 * commits (see settings.routes.ts), so it survives even when "audit_logs"
 * itself was one of the wiped categories.
 */
export async function wipeData(input: WipeDataInput): Promise<WipeDataResult> {
  validateWipeSelection(input.categories);
  const selected = new Set(input.categories);
  const rowsDeleted: Partial<Record<WipeCategory, number>> = {};
  const testModeCleanupErrors: string[] = [];

  // Test Mode creates real Discord channels; if we're about to wipe
  // "settings" (which stores the Test Mode state) while it's still enabled,
  // clean those channels up first so they don't become orphaned with no
  // record left to remove them by.
  if (selected.has("settings")) {
    const testModeState = await getTestModeStatus();
    if (testModeState?.enabled) {
      try {
        const result = await disableTestMode(input.actor, true);
        testModeCleanupErrors.push(...result.cleanupErrors);
      } catch (err) {
        testModeCleanupErrors.push(`Failed to disable Test Mode before wipe: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  await db.transaction(async (tx) => {
    for (const category of WIPE_ORDER) {
      if (!selected.has(category)) continue;

      switch (category) {
        case "warnings": {
          const deleted = await tx.delete(warnings).returning({ id: warnings.id });
          await tx.delete(idCounters).where(eq(idCounters.scope, "WRN"));
          rowsDeleted.warnings = deleted.length;
          break;
        }
        case "bans": {
          const deleted = await tx.delete(bans).returning({ id: bans.id });
          await tx.delete(idCounters).where(eq(idCounters.scope, "BAN"));
          rowsDeleted.bans = deleted.length;
          break;
        }
        case "players": {
          const deleted = await tx.delete(players).returning({ id: players.id });
          rowsDeleted.players = deleted.length;
          break;
        }
        case "staff_sessions": {
          const deleted = await tx.delete(staffSessions).returning({ id: staffSessions.id });
          rowsDeleted.staff_sessions = deleted.length;
          break;
        }
        case "staff_members": {
          const deleted = await tx.delete(staffMembers).returning({ id: staffMembers.id });
          rowsDeleted.staff_members = deleted.length;
          break;
        }
        case "audit_logs": {
          const deleted = await tx.delete(auditLogs).returning({ id: auditLogs.id });
          rowsDeleted.audit_logs = deleted.length;
          break;
        }
        case "settings": {
          const deleted = await tx.delete(systemSettings).returning({ key: systemSettings.key });
          rowsDeleted.settings = deleted.length;
          break;
        }
      }
    }
  });

  return { categories: input.categories, rowsDeleted, testModeCleanupErrors };
}
