import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { moderationStatusEnum, durationTypeEnum, evidenceTypeEnum, discordLogStatusEnum } from "./enums.js";
import { players } from "./players.js";
import { staffMembers } from "./staffMembers.js";

export const bans = pgTable(
  "bans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    banCode: text("ban_code").notNull().unique(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    fivemIdentifier: text("fivem_identifier"),
    discordUserId: text("discord_user_id"),
    playerName: text("player_name").notNull(),
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
    index("bans_player_id_idx").on(table.playerId),
    index("bans_status_idx").on(table.status),
    index("bans_expires_at_idx").on(table.expiresAt),
    index("bans_created_at_idx").on(table.createdAt),
  ],
);

export const banEvidence = pgTable(
  "ban_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    banId: uuid("ban_id")
      .notNull()
      .references(() => bans.id, { onDelete: "cascade" }),
    attachmentId: text("attachment_id"),
    attachmentUrl: text("attachment_url").notNull(),
    attachmentType: evidenceTypeEnum("attachment_type").notNull(),
    filename: text("filename").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ban_evidence_ban_id_idx").on(table.banId)],
);

export type Ban = typeof bans.$inferSelect;
export type NewBan = typeof bans.$inferInsert;
export type BanEvidence = typeof banEvidence.$inferSelect;
export type NewBanEvidence = typeof banEvidence.$inferInsert;
