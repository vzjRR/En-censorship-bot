import { formatDiscordDateTime, formatDiscordDate, formatBanShortDate } from "../../utils/timezone.js";
import { formatDurationArabic, formatDurationShort, type DurationType } from "../../moderation/duration.js";
import { getEffectiveTemplates, renderTemplate } from "../../settings/templates.service.js";
import { formatPermissionsListAr } from "../../auth/permissions.js";
import { env } from "../../config/env.js";

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
  staffName: string;
  staffRole: string;
}): Promise<string> {
  const templates = await getEffectiveTemplates();
  // Shown only when staff actually typed a FiveM server ID — never falls
  // back to the Discord ID or player name, per platform requirement.
  const identifier = params.fivemIdentifier?.trim() ?? "";
  const identifierLine = identifier ? `**Player id:** \`${identifier}\`\n` : "";
  const playerMention = params.playerDiscordId ? `<@${params.playerDiscordId}>` : params.playerName;
  const durationLabel = formatDurationShort(params.durationType, params.durationHours);
  return renderTemplate(templates.ban, {
    identifier,
    identifierLine,
    playerMention,
    playerName: params.playerName,
    duration: durationLabel,
    reason: params.reason,
    date: formatBanShortDate(params.issuedAt),
    staffMention: `<@${params.staffDiscordId}>`,
    staffName: params.staffName,
    staffRole: params.staffRole,
  });
}

export async function warningRevokedMessage(params: {
  playerDiscordId?: string | null;
  playerName: string;
  warningNumber: number;
  revokeReason: string;
  revokedAt: Date;
  staffDiscordId: string;
  staffName: string;
  staffRole: string;
}): Promise<string> {
  const templates = await getEffectiveTemplates();
  const playerRef = params.playerDiscordId ? `<@${params.playerDiscordId}>` : params.playerName;
  return renderTemplate(templates.warning_revoked, {
    playerRef,
    warningNumber: String(params.warningNumber),
    revokeReason: params.revokeReason,
    revokedDate: formatDiscordDateTime(params.revokedAt),
    staffMention: `<@${params.staffDiscordId}>`,
    staffName: params.staffName,
    staffRole: params.staffRole,
  });
}

export async function banRevokedMessage(params: {
  playerDiscordId?: string | null;
  playerName: string;
  revokeReason: string;
  revokedAt: Date;
  staffDiscordId: string;
  staffName: string;
  staffRole: string;
}): Promise<string> {
  const templates = await getEffectiveTemplates();
  const playerMention = params.playerDiscordId ? `<@${params.playerDiscordId}>` : params.playerName;
  return renderTemplate(templates.ban_revoked, {
    playerMention,
    playerName: params.playerName,
    revokeReason: params.revokeReason,
    revokedDate: formatDiscordDateTime(params.revokedAt),
    staffMention: `<@${params.staffDiscordId}>`,
    staffName: params.staffName,
    staffRole: params.staffRole,
  });
}

/** DM sent to a member the moment they're added as staff. */
export async function staffWelcomeMessage(params: { staffName: string; roleName: string; permissions: string[] }): Promise<string> {
  const templates = await getEffectiveTemplates();
  return renderTemplate(templates.staff_welcome, {
    staffName: params.staffName,
    roleName: params.roleName,
    capabilitiesList: formatPermissionsListAr(params.permissions),
    platformUrl: `${env.APP_BASE_URL}${env.BASE_PATH}`,
  });
}

/** DM sent to the player when they're warned (only when their Discord ID is known). */
export async function warningPlayerDmMessage(params: {
  playerName: string;
  warningNumber: number;
  reason: string;
  issuedAt: Date;
  durationType: DurationType;
  durationHours: number | null;
}): Promise<string> {
  const templates = await getEffectiveTemplates();
  return renderTemplate(templates.warning_player_dm, {
    playerName: params.playerName,
    warningNumber: String(params.warningNumber),
    reason: params.reason,
    duration: formatDurationArabic(params.durationType, params.durationHours),
    issuedDate: formatDiscordDate(params.issuedAt),
  });
}

/** DM sent to the player when they're banned (only when their Discord ID is known). */
export async function banPlayerDmMessage(params: {
  playerName: string;
  reason: string;
  issuedAt: Date;
  durationType: DurationType;
  durationHours: number | null;
}): Promise<string> {
  const templates = await getEffectiveTemplates();
  return renderTemplate(templates.ban_player_dm, {
    playerName: params.playerName,
    reason: params.reason,
    duration: formatDurationShort(params.durationType, params.durationHours),
    date: formatBanShortDate(params.issuedAt),
  });
}

/** DM sent to whoever holds the Manager role whenever a warning is issued. */
export async function managerAlertWarningMessage(params: {
  playerDiscordId?: string | null;
  playerName: string;
  warningNumber: number;
  reason: string;
  staffDiscordId: string;
  staffName: string;
}): Promise<string> {
  const templates = await getEffectiveTemplates();
  const playerRef = params.playerDiscordId ? `<@${params.playerDiscordId}>` : params.playerName;
  return renderTemplate(templates.manager_alert_warning, {
    playerRef,
    warningNumber: String(params.warningNumber),
    reason: params.reason,
    staffMention: `<@${params.staffDiscordId}>`,
    staffName: params.staffName,
  });
}

/** DM sent to whoever holds the Manager role whenever a ban is issued. */
export async function managerAlertBanMessage(params: {
  playerDiscordId?: string | null;
  playerName: string;
  reason: string;
  issuedAt: Date;
  durationType: DurationType;
  durationHours: number | null;
  staffDiscordId: string;
  staffName: string;
}): Promise<string> {
  const templates = await getEffectiveTemplates();
  const playerMention = params.playerDiscordId ? `<@${params.playerDiscordId}>` : params.playerName;
  return renderTemplate(templates.manager_alert_ban, {
    playerMention,
    playerName: params.playerName,
    reason: params.reason,
    duration: formatDurationShort(params.durationType, params.durationHours),
    staffMention: `<@${params.staffDiscordId}>`,
    staffName: params.staffName,
  });
}
