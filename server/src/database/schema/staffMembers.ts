import { pgTable, uuid, text, timestamp, index, jsonb } from "drizzle-orm/pg-core";
import { staffStatusEnum } from "./enums.js";
import { staffRoles } from "./staffRoles.js";

export const staffMembers = pgTable(
  "staff_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    discordUserId: text("discord_user_id").notNull().unique(),
    discordUsername: text("discord_username").notNull(),
    displayName: text("display_name").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => staffRoles.id, { onDelete: "restrict" }),
    /** Snapshot of Discord role IDs the member held the last time it was synced. */
    discordRoleIds: jsonb("discord_role_ids").$type<string[]>().notNull().default([]),
    status: staffStatusEnum("status").notNull().default("ACTIVE"),
    addedByDiscordId: text("added_by_discord_id").notNull(),
    lastRoleSyncAt: timestamp("last_role_sync_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("staff_members_discord_user_id_idx").on(table.discordUserId),
    index("staff_members_status_idx").on(table.status),
  ],
);

export type StaffMember = typeof staffMembers.$inferSelect;
export type NewStaffMember = typeof staffMembers.$inferInsert;
