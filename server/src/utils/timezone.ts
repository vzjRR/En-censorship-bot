import { DateTime } from "luxon";
import { env } from "../config/env.js";

/** All timestamps are stored in UTC in the database; this is the only place that applies the display timezone. */
export const DISPLAY_TIMEZONE = env.TIMEZONE;

export function toDisplayZone(date: Date | string): DateTime {
  const dt = typeof date === "string" ? DateTime.fromISO(date) : DateTime.fromJSDate(date);
  return dt.setZone(DISPLAY_TIMEZONE);
}

/** e.g. "18/08/2026" — used in Discord moderation log messages. */
export function formatDiscordDate(date: Date | string): string {
  return toDisplayZone(date).toFormat("dd/LL/yyyy");
}

/** e.g. "31-8-26" — used in the ban Discord log message template. */
export function formatBanShortDate(date: Date | string): string {
  return toDisplayZone(date).toFormat("d-L-yy");
}

/** e.g. "18/08/2026 14:35" — used for staff login/logout Discord messages. */
export function formatDiscordDateTime(date: Date | string): string {
  return toDisplayZone(date).toFormat("dd/LL/yyyy HH:mm");
}

/** e.g. "18 Aug 2026, 14:35" — used across the dashboard UI (via the API responses). */
export function formatDashboardDateTime(date: Date | string): string {
  return toDisplayZone(date).toFormat("dd LLL yyyy, HH:mm");
}

export function nowInDisplayZone(): DateTime {
  return DateTime.now().setZone(DISPLAY_TIMEZONE);
}
