import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

export const players = pgTable(
  "players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    discordUserId: text("discord_user_id"),
    discordUsername: text("discord_username"),
    fivemIdentifier: text("fivem_identifier"),
    playerName: text("player_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("players_discord_user_id_idx").on(table.discordUserId),
    index("players_fivem_identifier_idx").on(table.fivemIdentifier),
    index("players_player_name_idx").on(table.playerName),
  ],
);

export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
