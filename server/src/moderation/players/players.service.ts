import { eq, or, ilike, desc, and } from "drizzle-orm";
import { db } from "../../database/client.js";
import { players, warnings, bans, type Player } from "../../database/schema/index.js";

export interface FindOrCreatePlayerInput {
  discordUserId?: string | null;
  discordUsername?: string | null;
  fivemIdentifier?: string | null;
  playerName: string;
}

/**
 * Resolves a player record by the strongest identifier available
 * (Discord ID, then FiveM identifier), creating one if none exists yet.
 * Existing records are enriched with any newly supplied identifiers.
 */
export async function findOrCreatePlayer(input: FindOrCreatePlayerInput): Promise<Player> {
  let existing: Player | undefined;

  if (input.discordUserId) {
    existing = await db.query.players.findFirst({ where: eq(players.discordUserId, input.discordUserId) });
  }
  if (!existing && input.fivemIdentifier) {
    existing = await db.query.players.findFirst({ where: eq(players.fivemIdentifier, input.fivemIdentifier) });
  }

  if (existing) {
    const patch: Partial<typeof players.$inferInsert> = {};
    if (input.discordUserId && !existing.discordUserId) patch.discordUserId = input.discordUserId;
    if (input.discordUsername && !existing.discordUsername) patch.discordUsername = input.discordUsername;
    if (input.fivemIdentifier && !existing.fivemIdentifier) patch.fivemIdentifier = input.fivemIdentifier;
    if (input.playerName && input.playerName !== existing.playerName) patch.playerName = input.playerName;

    if (Object.keys(patch).length > 0) {
      const [updated] = await db
        .update(players)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(players.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }

  const [created] = await db
    .insert(players)
    .values({
      discordUserId: input.discordUserId ?? null,
      discordUsername: input.discordUsername ?? null,
      fivemIdentifier: input.fivemIdentifier ?? null,
      playerName: input.playerName,
    })
    .returning();
  return created;
}

export async function findPlayerById(id: string): Promise<Player | undefined> {
  return db.query.players.findFirst({ where: eq(players.id, id) });
}

export async function searchPlayers(query: string, limit = 10): Promise<Player[]> {
  const q = `%${query.trim()}%`;
  return db
    .select()
    .from(players)
    .where(or(ilike(players.playerName, q), eq(players.discordUserId, query.trim()), ilike(players.fivemIdentifier, q)))
    .orderBy(desc(players.updatedAt))
    .limit(limit);
}

export interface PlayerModerationSummary {
  player: Player;
  warnings: (typeof warnings.$inferSelect)[];
  bans: (typeof bans.$inferSelect)[];
}

export async function getPlayerProfile(playerId: string): Promise<PlayerModerationSummary | null> {
  const player = await findPlayerById(playerId);
  if (!player) return null;

  const [playerWarnings, playerBans] = await Promise.all([
    db.select().from(warnings).where(eq(warnings.playerId, playerId)).orderBy(desc(warnings.issuedAt)),
    db.select().from(bans).where(eq(bans.playerId, playerId)).orderBy(desc(bans.issuedAt)),
  ]);

  return { player, warnings: playerWarnings, bans: playerBans };
}

export interface TimelineEvent {
  date: Date;
  type:
    | "WARNING_ISSUED"
    | "WARNING_EXPIRED"
    | "WARNING_REVOKED"
    | "BAN_ISSUED"
    | "BAN_EXPIRED"
    | "BAN_REVOKED";
  refCode: string;
  summary: string;
  staffName?: string | null;
}

export async function getPlayerTimeline(playerId: string): Promise<TimelineEvent[]> {
  const summary = await getPlayerProfile(playerId);
  if (!summary) return [];

  const events: TimelineEvent[] = [];

  for (const w of summary.warnings) {
    events.push({
      date: w.issuedAt,
      type: "WARNING_ISSUED",
      refCode: w.warningCode,
      summary: `Warning #${w.warningNumber} — ${w.reason}`,
      staffName: w.issuedByName,
    });
    if (w.status === "EXPIRED" && w.expiresAt) {
      events.push({ date: w.expiresAt, type: "WARNING_EXPIRED", refCode: w.warningCode, summary: `Warning #${w.warningNumber} expired` });
    }
    if (w.status === "REVOKED" && w.revokedAt) {
      events.push({
        date: w.revokedAt,
        type: "WARNING_REVOKED",
        refCode: w.warningCode,
        summary: `Warning #${w.warningNumber} revoked — ${w.revokedReason ?? ""}`,
      });
    }
  }

  for (const b of summary.bans) {
    events.push({
      date: b.issuedAt,
      type: "BAN_ISSUED",
      refCode: b.banCode,
      summary: `Ban (${b.durationType}) — ${b.reason}`,
      staffName: b.issuedByName,
    });
    if (b.status === "EXPIRED" && b.expiresAt) {
      events.push({ date: b.expiresAt, type: "BAN_EXPIRED", refCode: b.banCode, summary: "Ban expired" });
    }
    if (b.status === "REVOKED" && b.revokedAt) {
      events.push({ date: b.revokedAt, type: "BAN_REVOKED", refCode: b.banCode, summary: `Ban revoked — ${b.revokedReason ?? ""}` });
    }
  }

  return events.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export async function countActiveWarningsForPlayer(playerId: string): Promise<number> {
  const rows = await db
    .select({ id: warnings.id })
    .from(warnings)
    .where(and(eq(warnings.playerId, playerId), eq(warnings.status, "ACTIVE")));
  return rows.length;
}

export async function countTotalWarningsForPlayer(playerId: string): Promise<number> {
  const rows = await db.select({ id: warnings.id }).from(warnings).where(eq(warnings.playerId, playerId));
  return rows.length;
}
