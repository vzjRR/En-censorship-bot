import { and, gte, eq, sql, desc } from "drizzle-orm";
import { db } from "../database/client.js";
import { warnings, bans, staffSessions, players } from "../database/schema/index.js";
import { nowInDisplayZone } from "../utils/timezone.js";

function rangeStart(unit: "day" | "week" | "month"): Date {
  const now = nowInDisplayZone();
  if (unit === "day") return now.startOf("day").toJSDate();
  if (unit === "week") return now.startOf("week").toJSDate();
  return now.startOf("month").toJSDate();
}

async function countSince(table: typeof warnings | typeof bans, since: Date): Promise<number> {
  const rows = await db
    .select({ id: table.id })
    .from(table as any)
    .where(gte((table as any).issuedAt, since));
  return rows.length;
}

export interface DashboardOverview {
  staffOnline: number;
  activeWarnings: number;
  activeBans: number;
  warningsToday: number;
  bansToday: number;
  warningsThisWeek: number;
  bansThisWeek: number;
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const [onDuty, activeWarningsRows, activeBansRows, warningsToday, bansToday, warningsThisWeek, bansThisWeek] = await Promise.all([
    db.select({ id: staffSessions.id }).from(staffSessions).where(eq(staffSessions.status, "ACTIVE")),
    db.select({ id: warnings.id }).from(warnings).where(eq(warnings.status, "ACTIVE")),
    db.select({ id: bans.id }).from(bans).where(eq(bans.status, "ACTIVE")),
    countSince(warnings, rangeStart("day")),
    countSince(bans, rangeStart("day")),
    countSince(warnings, rangeStart("week")),
    countSince(bans, rangeStart("week")),
  ]);

  return {
    staffOnline: onDuty.length,
    activeWarnings: activeWarningsRows.length,
    activeBans: activeBansRows.length,
    warningsToday,
    bansToday,
    warningsThisWeek,
    bansThisWeek,
  };
}

export interface PeriodStatistics {
  warningsToday: number;
  warningsThisWeek: number;
  warningsThisMonth: number;
  bansToday: number;
  bansThisWeek: number;
  bansThisMonth: number;
}

export async function getPeriodStatistics(): Promise<PeriodStatistics> {
  const [wD, wW, wM, bD, bW, bM] = await Promise.all([
    countSince(warnings, rangeStart("day")),
    countSince(warnings, rangeStart("week")),
    countSince(warnings, rangeStart("month")),
    countSince(bans, rangeStart("day")),
    countSince(bans, rangeStart("week")),
    countSince(bans, rangeStart("month")),
  ]);
  return {
    warningsToday: wD,
    warningsThisWeek: wW,
    warningsThisMonth: wM,
    bansToday: bD,
    bansThisWeek: bW,
    bansThisMonth: bM,
  };
}

export interface StaffLeaderboardEntry {
  staffName: string;
  warningsIssued: number;
  bansIssued: number;
}

export async function getMostActiveStaff(limit = 10): Promise<StaffLeaderboardEntry[]> {
  const warningCounts = await db
    .select({ name: warnings.issuedByName, count: sql<number>`count(*)::int` })
    .from(warnings)
    .groupBy(warnings.issuedByName);
  const banCounts = await db
    .select({ name: bans.issuedByName, count: sql<number>`count(*)::int` })
    .from(bans)
    .groupBy(bans.issuedByName);

  const merged = new Map<string, StaffLeaderboardEntry>();
  for (const row of warningCounts) {
    merged.set(row.name, { staffName: row.name, warningsIssued: row.count, bansIssued: 0 });
  }
  for (const row of banCounts) {
    const entry = merged.get(row.name) ?? { staffName: row.name, warningsIssued: 0, bansIssued: 0 };
    entry.bansIssued = row.count;
    merged.set(row.name, entry);
  }

  return [...merged.values()].sort((a, b) => b.warningsIssued + b.bansIssued - (a.warningsIssued + a.bansIssued)).slice(0, limit);
}

export interface MostWarnedPlayerEntry {
  playerId: string;
  playerName: string;
  warningCount: number;
}

export async function getMostWarnedPlayers(limit = 10): Promise<MostWarnedPlayerEntry[]> {
  const rows = await db
    .select({ playerId: warnings.playerId, count: sql<number>`count(*)::int` })
    .from(warnings)
    .groupBy(warnings.playerId)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);

  const results: MostWarnedPlayerEntry[] = [];
  for (const row of rows) {
    const player = await db.query.players.findFirst({ where: eq(players.id, row.playerId) });
    results.push({ playerId: row.playerId, playerName: player?.playerName ?? "Unknown", warningCount: row.count });
  }
  return results;
}

export interface ReasonFrequency {
  reason: string;
  count: number;
}

export async function getMostCommonWarningReasons(limit = 10): Promise<ReasonFrequency[]> {
  const rows = await db
    .select({ reason: warnings.reason, count: sql<number>`count(*)::int` })
    .from(warnings)
    .groupBy(warnings.reason)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
  return rows;
}

export interface StaffPersonalStatistics {
  warningsIssued: number;
  bansIssued: number;
  sessions: number;
  totalOnDutyMinutes: number;
  averageSessionMinutes: number;
}

export async function getStaffPersonalStatistics(staffDiscordId: string, staffName: string): Promise<StaffPersonalStatistics> {
  const [warningRows, banRows, sessions] = await Promise.all([
    db.select({ id: warnings.id }).from(warnings).where(eq(warnings.issuedByName, staffName)),
    db.select({ id: bans.id }).from(bans).where(eq(bans.issuedByName, staffName)),
    db.query.staffSessions.findMany({ where: eq(staffSessions.staffUserId, staffDiscordId) }),
  ]);

  const completed = sessions.filter((s) => s.status === "COMPLETED" && s.logoutTime);
  const totalMinutes = completed.reduce((sum, s) => sum + (s.logoutTime!.getTime() - s.loginTime.getTime()) / 60000, 0);

  return {
    warningsIssued: warningRows.length,
    bansIssued: banRows.length,
    sessions: sessions.length,
    totalOnDutyMinutes: Math.round(totalMinutes),
    averageSessionMinutes: completed.length ? Math.round(totalMinutes / completed.length) : 0,
  };
}
