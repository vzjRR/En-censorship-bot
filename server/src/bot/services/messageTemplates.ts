import { formatDiscordDateTime, formatDiscordDate, formatBanShortDate } from "../../utils/timezone.js";
import { formatDurationArabic, formatDurationShort, type DurationType } from "../../moderation/duration.js";

/**
 * These templates are intentionally fixed strings per the platform
 * specification — only the interpolated values change. Do not alter the
 * wording/labels without updating the spec, since staff rely on the exact
 * layout for record-keeping in the moderation channels.
 */

export function staffLoginMessage(params: { staffName: string; staffRole: string; loginTime: Date }): string {
  return [
    "دخول الرقابة:",
    `الاسم: ${params.staffName}`,
    `الرتبة: ${params.staffRole}`,
    `وقت الدخول: ${formatDiscordDateTime(params.loginTime)}`,
  ].join("\n");
}

export function staffLogoutMessage(params: {
  staffName: string;
  staffRole: string;
  logoutTime: Date;
  notes?: string | null;
}): string {
  return [
    "خروج الرقابة:",
    `الاسم: ${params.staffName}`,
    `الرتبة: ${params.staffRole}`,
    `وقت الخروج: ${formatDiscordDateTime(params.logoutTime)}`,
    `ملاحظات: ${params.notes?.trim() ? params.notes.trim() : "لا يوجد"}`,
  ].join("\n");
}

export function warningLogMessage(params: {
  playerDiscordId?: string | null;
  playerName: string;
  warningNumber: number;
  reason: string;
  issuedAt: Date;
  durationType: DurationType;
  durationHours: number | null;
  staffName: string;
}): string {
  const playerRef = params.playerDiscordId ? `<@${params.playerDiscordId}>` : params.playerName;
  return [
    "**يتم تسجيل الورنيج بالصيغة التالية:**",
    `اسم اللاعب: ${playerRef}`,
    `رقم الورنيج: warning ${params.warningNumber}`,
    `سبب الورنيج: ${params.reason}`,
    `تاريخ الإصدار: ${formatDiscordDate(params.issuedAt)}`,
    `مدة الورنيج: ${formatDurationArabic(params.durationType, params.durationHours)}`,
    `اسم الرقابي: ${params.staffName}`,
  ].join("\n");
}

export function banLogMessage(params: {
  fivemIdentifier?: string | null;
  playerDiscordId?: string | null;
  playerName: string;
  reason: string;
  issuedAt: Date;
  durationType: DurationType;
  durationHours: number | null;
  staffDiscordId: string;
}): string {
  const identifier = params.fivemIdentifier?.trim() || params.playerDiscordId || params.playerName;
  const durationLabel = formatDurationShort(params.durationType, params.durationHours);
  return [
    `player id : ${identifier}`,
    `band: ${durationLabel}`,
    `Reason: ${params.reason}`,
    `date: ${formatBanShortDate(params.issuedAt)}`,
    `band time : ${durationLabel}`,
    `censorhip name: <@${params.staffDiscordId}>`,
  ].join("\n");
}
