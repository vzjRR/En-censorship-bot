import { formatDiscordDateTime, formatDiscordDate, formatBanShortDate } from "../../utils/timezone.js";
import { formatDurationArabic, formatDurationShort, type DurationType } from "../../moderation/duration.js";
import { getEffectiveTemplates, renderTemplate } from "../../settings/templates.service.js";

/**
 * These templates default to the platform's fixed wording, but staff with
 * the `messages.manage` permission can edit them from Settings → Messages
 * (only the wording/placeholders change there — the set of placeholders
 * available for each message type stays fixed, see
 * settings/templates.service.ts).
 */

export async function staffLoginMessage(params: { staffName: string; staffRole: string; loginTime: Date }): Promise<string> {
  const templates = await getEffectiveTemplates();
  return renderTemplate(templates.staff_login, {
    staffName: params.staffName,
    staffRole: params.staffRole,
    loginTime: formatDiscordDateTime(params.loginTime),
  });
}

export async function staffLogoutMessage(params: {
  staffName: string;
  staffRole: string;
  logoutTime: Date;
  notes?: string | null;
}): Promise<string> {
  const templates = await getEffectiveTemplates();
  return renderTemplate(templates.staff_logout, {
    staffName: params.staffName,
    staffRole: params.staffRole,
    logoutTime: formatDiscordDateTime(params.logoutTime),
    notes: params.notes?.trim() ? params.notes.trim() : "لا يوجد",
  });
}

export async function warningLogMessage(params: {
  playerDiscordId?: string | null;
  playerName: string;
  warningNumber: number;
  reason: string;
  issuedAt: Date;
  durationType: DurationType;
  durationHours: number | null;
  staffName: string;
  staffDiscordId: string;
  staffRole: string;
}): Promise<string> {
  const templates = await getEffectiveTemplates();
  const playerRef = params.playerDiscordId ? `<@${params.playerDiscordId}>` : params.playerName;
  return renderTemplate(templates.warning, {
    playerRef,
    warningNumber: String(params.warningNumber),
    reason: params.reason,
    issuedDate: formatDiscordDate(params.issuedAt),
    duration: formatDurationArabic(params.durationType, params.durationHours),
    staffName: params.staffName,
    staffMention: `<@${params.staffDiscordId}>`,
    staffRole: params.staffRole,
  });
}

export async function banLogMessage(params: {
  fivemIdentifier?: string | null;
  playerDiscordId?: string | null;
  playerName: string;
  reason: string;
  issuedAt: Date;
  durationType: DurationType;
  durationHours: number | null;
  staffDiscordId: string;
  staffRole: string;
}): Promise<string> {
  const templates = await getEffectiveTemplates();
  const identifier = params.fivemIdentifier?.trim() || params.playerDiscordId || params.playerName;
  const playerMention = params.playerDiscordId ? `<@${params.playerDiscordId}>` : params.playerName;
  const durationLabel = formatDurationShort(params.durationType, params.durationHours);
  return renderTemplate(templates.ban, {
    identifier,
    playerMention,
    duration: durationLabel,
    reason: params.reason,
    date: formatBanShortDate(params.issuedAt),
    staffMention: `<@${params.staffDiscordId}>`,
    staffRole: params.staffRole,
  });
}
