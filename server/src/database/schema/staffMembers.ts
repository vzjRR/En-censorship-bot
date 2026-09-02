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
    /** Snapshot of every Discord role ID the member held the last time it was synced. */
    discordRoleIds: jsonb("discord_role_ids").$type<string[]>().notNull().default([]),
    /**
     * The ONE Discord role chosen to represent this person as staff — distinct
     * from `role_id` (the platform's internal permission level). Discord
     * moderation log messages display this, never the platform role, per the
     * platform requirement that the two stay separate. `discord_role_name` is
     * a cache (refreshed whenever it's (re)picked) so message-sending never
     * has to make a live Discord API call.
     */
    discordRoleId: text("discord_role_id"),
    discordRoleName: text("discord_role_name"),
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
