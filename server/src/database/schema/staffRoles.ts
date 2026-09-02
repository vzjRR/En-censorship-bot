import { pgTable, uuid, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * Configurable moderation role levels (Manager, Deputy Manager, Staff, ...).
 * The Platform Owner is NOT represented here — ownership is derived
 * server-side from PLATFORM_OWNER_ID and always has full access regardless
 * of what is stored in this table (see auth/authorization.ts).
 */
export const staffRoles = pgTable("staff_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  /** Lower rank = higher authority. Used for hierarchy checks (e.g. who can edit whom). */
  rank: integer("rank").notNull(),
  /** List of permission strings, see auth/permissions.ts for the canonical set. */
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  /** Optional Discord role ID that must still be held for this platform role to remain valid. */
  requiredDiscordRoleId: text("required_discord_role_id"),
  /** System roles (seeded defaults) cannot be deleted, only edited. */
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StaffRole = typeof staffRoles.$inferSelect;
export type NewStaffRole = typeof staffRoles.$inferInsert;
