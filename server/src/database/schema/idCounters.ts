import { pgTable, text, integer, primaryKey } from "drizzle-orm/pg-core";

/**
 * Backing store for atomically generated, human-readable moderation IDs
 * such as WRN-2026-000123 and BAN-2026-000057. One row per (scope, year).
 */
export const idCounters = pgTable(
  "id_counters",
  {
    scope: text("scope").notNull(),
    year: integer("year").notNull(),
    counter: integer("counter").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.scope, table.year] })],
);

export type IdCounter = typeof idCounters.$inferSelect;
