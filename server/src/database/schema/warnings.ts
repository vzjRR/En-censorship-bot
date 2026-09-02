import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { moderationStatusEnum, durationTypeEnum, evidenceTypeEnum, discordLogStatusEnum } from "./enums.js";
import { players } from "./players.js";
import { staffMembers } from "./staffMembers.js";

export const warnings = pgTable(
  "warnings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    warningCode: text("warning_code").notNull().unique(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    warningNumber: integer("warning_number").notNull(),
    reason: text("reason").notNull(),
    durationType: durationTypeEnum("duration_type").notNull(),
    durationHours: integer("duration_hours"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: moderationStatusEnum("status").notNull().default("ACTIVE"),
    issuedByStaffId: uuid("issued_by_staff_id")
      .notNull()
      .references(() => staffMembers.id, { onDelete: "restrict" }),
    issuedByName: text("issued_by_name").notNull(),
    revokedByStaffId: uuid("revoked_by_staff_id").references(() => staffMembers.id),
    revokedReason: text("revoked_reason"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    discordMessageId: text("discord_message_id"),
    discordLogStatus: discordLogStatusEnum("discord_log_status").notNull().default("PENDING"),
    idempotencyKey: text("idempotency_key").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("warnings_player_id_idx").on(table.playerId),
    index("warnings_status_idx").on(table.status),
    index("warnings_expires_at_idx").on(table.expiresAt),
    index("warnings_created_at_idx").on(table.createdAt),
  ],
);

export const warningEvidence = pgTable(
  "warning_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    warningId: uuid("warning_id")
      .notNull()
      .references(() => warnings.id, { onDelete: "cascade" }),
    attachmentId: text("attachment_id"),
    attachmentUrl: text("attachment_url").notNull(),
    attachmentType: evidenceTypeEnum("attachment_type").notNull(),
    filename: text("filename").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("warning_evidence_warning_id_idx").on(table.warningId)],
);

export type Warning = typeof warnings.$inferSelect;
export type NewWarning = typeof warnings.$inferInsert;
export type WarningEvidence = typeof warningEvidence.$inferSelect;
export type NewWarningEvidence = typeof warningEvidence.$inferInsert;
