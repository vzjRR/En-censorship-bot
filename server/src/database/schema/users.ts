import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Cache of every Discord identity that has ever completed OAuth2 login.
 * This is intentionally separate from `staff_members`: logging in does not
 * imply moderation access, it just means we know who this Discord user is.
 */
export const users = pgTable(
  "users",
  {
    discordUserId: text("discord_user_id").primaryKey(),
    username: text("username").notNull(),
    globalName: text("global_name"),
    avatarHash: text("avatar_hash"),
    firstLoginAt: timestamp("first_login_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginIp: text("last_login_ip"),
  },
  (table) => [index("users_username_idx").on(table.username)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
