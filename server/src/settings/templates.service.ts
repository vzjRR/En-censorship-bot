import { getSetting, setSetting } from "./settings.service.js";

export type TemplateKey =
  | "staff_login"
  | "staff_logout"
  | "warning"
  | "ban"
  | "warning_revoked"
  | "ban_revoked"
  | "staff_welcome"
  | "warning_player_dm"
  | "ban_player_dm"
  | "manager_alert_warning"
  | "manager_alert_ban";

export interface TemplateDefinition {
  key: TemplateKey;
  label: string;
  description: string;
  placeholders: string[];
  default: string;
}

/**
 * The default wording matches the platform's original fixed-format
 * requirements exactly. Anything a staff member with `messages.manage`
 * saves in Settings overrides this text (placeholders are still
 * substituted the same way) — if they clear a template back to empty, this
 * default is used again.
 */
export const TEMPLATE_DEFINITIONS: Record<TemplateKey, TemplateDefinition> = {
  staff_login: {
    key: "staff_login",
    label: "Staff Login",
    description: "Posted to the staff log channel when someone goes on duty.",
    placeholders: ["staffName", "staffRole", "loginTime"],
    default: [
      "**__دخول الرقابة:__**",
      "",
      "**الاسم:** `{{staffName}}`",
      // staffRole is a Discord ROLE MENTION (<@&id>) — never wrap a mention
      // in backticks, Discord doesn't parse markdown/mentions inside inline code.
      "**الرتبة:** {{staffRole}}",
      "**وقت الدخول:** `{{loginTime}}`",
    ].join("\n"),
  },
  staff_logout: {
    key: "staff_logout",
    label: "Staff Logout",
    description: "Posted to the staff log channel when someone goes off duty.",
    placeholders: ["staffName", "staffRole", "logoutTime", "notes"],
    default: [
      "**~~خروج الرقابة:~~**",
      "",
      "**الاسم:** `{{staffName}}`",
      // staffRole is a Discord ROLE MENTION (<@&id>) — never wrap a mention
      // in backticks, Discord doesn't parse markdown/mentions inside inline code.
      "**الرتبة:** {{staffRole}}",
      "**وقت الخروج:** `{{logoutTime}}`",
      "**ملاحظات:** `{{notes}}`",
    ].join("\n"),
  },
  warning: {
    key: "warning",
    label: "Warning Issued",
    description: "Posted to the warning log channel whenever a warning is created.",
    // staffRole is not shown by default here — per platform requirement it's
    // only written into the staff login/logout messages, not every warning/ban.
    placeholders: ["playerRef", "warningNumber", "reason", "issuedDate", "duration", "staffName", "staffMention", "staffRole"],
    default: [
      // playerRef/staffMention are Discord mentions — never wrapped in
      // backticks, Discord doesn't parse mentions inside inline code.
      "**اسم اللاعب:** {{playerRef}}",
      "**رقم الورنيج:** `warning {{warningNumber}}`",
      "**سبب الورنيج:** `{{reason}}`",
      "**تاريخ الإصدار:** `{{issuedDate}}`",
      "**مدة الورنيج:** `{{duration}}`",
      "**اسم الرقابي:** {{staffMention}}",
    ].join("\n"),
  },
  ban: {
    key: "ban",
    label: "Ban Issued",
    description: "Posted to the ban log channel whenever a ban is created.",
    // identifierLine is the fully-formed "Player id" line — it's already
    // empty when staff didn't type a FiveM ID (see banLogMessage), so the
    // template just needs to reference it, not decide whether to show it.
    // playerMention/staffMention already show the resolved Discord name
    // themselves once rendered (falling back to plain text when no Discord
    // ID is known) — playerName/staffName are still available as
    // placeholders but the default doesn't repeat them alongside the mention.
    placeholders: ["identifierLine", "identifier", "playerMention", "playerName", "duration", "reason", "date", "staffMention", "staffName", "staffRole"],
    default: [
      "{{identifierLine}}**Player:** {{playerMention}}",
      "**Reason:** `{{reason}}`",
      "**Date:** `{{date}}`",
      "**Band time:** `{{duration}}`",
      "**Censorship name:** {{staffMention}}",
    ].join("\n"),
  },
  warning_revoked: {
    key: "warning_revoked",
    label: "Warning Revoked",
    description: "Posted to the warning log channel whenever a warning is revoked.",
    placeholders: ["playerRef", "warningNumber", "revokeReason", "staffMention", "staffName", "staffRole", "revokedDate"],
    default: [
      "**تم إلغاء الورنيج**",
      "**اسم اللاعب:** {{playerRef}}",
      "**رقم الورنيج:** `warning {{warningNumber}}`",
      "**سبب الإلغاء:** `{{revokeReason}}`",
      "**بواسطة:** {{staffMention}}",
      "**التاريخ:** `{{revokedDate}}`",
    ].join("\n"),
  },
  ban_revoked: {
    key: "ban_revoked",
    label: "Ban Revoked",
    description: "Posted to the ban log channel whenever a ban is revoked.",
    placeholders: ["playerMention", "playerName", "revokeReason", "staffMention", "staffName", "staffRole", "revokedDate"],
    default: [
      "**Ban Revoked**",
      "**Player:** {{playerMention}}",
      "**Reason:** `{{revokeReason}}`",
      "**By:** {{staffMention}}",
      "**Date:** `{{revokedDate}}`",
    ].join("\n"),
  },
  staff_welcome: {
    key: "staff_welcome",
    label: "Staff Welcome (DM)",
    description: "Sent as a Discord direct message to a member the moment they're added as staff.",
    placeholders: ["staffName", "roleName", "capabilitiesList", "platformUrl"],
    default: [
      "**مرحبًا بك في طاقم الرقابة، {{staffName}}!**",
      "",
      "تم إضافتك برتبة: **{{roleName}}**",
      "",
      "**بصلاحيتك تقدر:**",
      "{{capabilitiesList}}",
      "",
      "**رابط المنصة:** {{platformUrl}}",
      "",
      "تقدر تستخدم المنصة من متصفح الكمبيوتر مباشرة، لكن يُفضّل تثبيتها كتطبيق:",
      "• **من الكمبيوتر:** افتح الرابط بمتصفح Chrome/Edge، وبتلاقي أيقونة تثبيت بجانب شريط العنوان.",
      "• **من الهاتف:** افتح الرابط، ثم من قائمة المتصفح اختر \"Add to Home Screen\" / \"تثبيت التطبيق\" — التثبيت **إلزامي** لاستخدام المنصة من الهاتف.",
    ].join("\n"),
  },
  warning_player_dm: {
    key: "warning_player_dm",
    label: "Warning Notice (DM to player)",
    description: "Sent as a Discord direct message to the player when they're warned (only if their Discord ID is known).",
    placeholders: ["playerName", "warningNumber", "reason", "duration", "issuedDate"],
    default: [
      "**تم تسجيل تحذير (ورنينج) بحقك**",
      "",
      "**رقم الورنيج:** warning {{warningNumber}}",
      "**السبب:** {{reason}}",
      "**المدة:** {{duration}}",
      "**التاريخ:** {{issuedDate}}",
    ].join("\n"),
  },
  ban_player_dm: {
    key: "ban_player_dm",
    label: "Ban Notice (DM to player)",
    description: "Sent as a Discord direct message to the player when they're banned (only if their Discord ID is known).",
    placeholders: ["playerName", "reason", "duration", "date"],
    default: [
      "**تم حظرك (باند)**",
      "",
      "**السبب:** {{reason}}",
      "**المدة:** {{duration}}",
      "**التاريخ:** {{date}}",
    ].join("\n"),
  },
  manager_alert_warning: {
    key: "manager_alert_warning",
    label: "Manager Alert — Warning (DM)",
    description: "Sent as a Discord direct message to whoever holds the Manager role whenever a warning is issued.",
    placeholders: ["playerRef", "warningNumber", "reason", "staffMention", "staffName"],
    default: [
      "**تنبيه: تم إصدار ورنينج**",
      "**اللاعب:** {{playerRef}}",
      "**رقم الورنيج:** warning {{warningNumber}}",
      "**السبب:** {{reason}}",
      "**بواسطة:** {{staffMention}}",
    ].join("\n"),
  },
  manager_alert_ban: {
    key: "manager_alert_ban",
    label: "Manager Alert — Ban (DM)",
    description: "Sent as a Discord direct message to whoever holds the Manager role whenever a ban is issued.",
    placeholders: ["playerMention", "playerName", "reason", "duration", "staffMention", "staffName"],
    default: [
      "**تنبيه: تم إصدار باند**",
      "**اللاعب:** {{playerMention}}",
      "**السبب:** {{reason}}",
      "**المدة:** {{duration}}",
      "**بواسطة:** {{staffMention}}",
    ].join("\n"),
  },
};

const TEMPLATES_SETTINGS_KEY = "message_templates";

type TemplateOverrides = Partial<Record<TemplateKey, string>>;

export async function getTemplateOverrides(): Promise<TemplateOverrides> {
  return (await getSetting<TemplateOverrides>(TEMPLATES_SETTINGS_KEY)) ?? {};
}

export async function getEffectiveTemplates(): Promise<Record<TemplateKey, string>> {
  const overrides = await getTemplateOverrides();
  const result = {} as Record<TemplateKey, string>;
  for (const def of Object.values(TEMPLATE_DEFINITIONS)) {
    const custom = overrides[def.key];
    result[def.key] = custom && custom.trim().length > 0 ? custom : def.default;
  }
  return result;
}

export async function setTemplateOverride(key: TemplateKey, template: string, updatedBy: string): Promise<void> {
  if (!(key in TEMPLATE_DEFINITIONS)) throw new Error(`Unknown template key: ${key}`);
  const overrides = await getTemplateOverrides();
  overrides[key] = template;
  await setSetting(TEMPLATES_SETTINGS_KEY, overrides, updatedBy);
}

export async function resetTemplateOverride(key: TemplateKey, updatedBy: string): Promise<void> {
  const overrides = await getTemplateOverrides();
  delete overrides[key];
  await setSetting(TEMPLATES_SETTINGS_KEY, overrides, updatedBy);
}

/** Replaces every {{token}} in a template with values[token] (or "" if missing). */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, token: string) => values[token] ?? "");
}
