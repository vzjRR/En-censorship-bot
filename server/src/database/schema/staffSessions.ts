import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { staffSessionStatusEnum } from "./enums.js";
import { staffMembers } from "./staffMembers.js";

export const staffSessions = pgTable(
  "staff_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staffMembers.id, { onDelete: "cascade" }),
    staffUserId: text("staff_user_id").notNull(),
    staffName: text("staff_name").notNull(),
    staffRole: text("staff_role").notNull(),
    loginTime: timestamp("login_time", { withTimezone: true }).notNull().defaultNow(),
    logoutTime: timestamp("logout_time", { withTimezone: true }),
    notes: text("notes"),
    status: staffSessionStatusEnum("status").notNull().default("ACTIVE"),
    loginMessageId: text("login_message_id"),
    logoutMessageId: text("logout_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("staff_sessions_staff_id_idx").on(table.staffId),
    index("staff_sessions_status_idx").on(table.status),
    index("staff_sessions_staff_user_id_idx").on(table.staffUserId),
    // Enforces "one active duty session per staff member" at the database
    // level so a double-submit (or a race between two tabs) can never
    // create two concurrent ACTIVE sessions for the same staff member.
    uniqueIndex("staff_sessions_one_active_per_staff_idx")
      .on(table.staffId)
      .where(sql`${table.status} = 'ACTIVE'`),
  ],
);

export type StaffSession = typeof staffSessions.$inferSelect;
export type NewStaffSession = typeof staffSessions.$inferInsert;
