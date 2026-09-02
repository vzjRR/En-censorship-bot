import { getSetting, setSetting } from "./settings.service.js";

export type TemplateKey = "staff_login" | "staff_logout" | "warning" | "ban";

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
    default: ["دخول الرقابة:", "الاسم: {{staffName}}", "الرتبة: {{staffRole}}", "وقت الدخول: {{loginTime}}"].join("\n"),
  },
  staff_logout: {
    key: "staff_logout",
    label: "Staff Logout",
    description: "Posted to the staff log channel when someone goes off duty.",
    placeholders: ["staffName", "staffRole", "logoutTime", "notes"],
    default: [
      "خروج الرقابة:",
      "الاسم: {{staffName}}",
      "الرتبة: {{staffRole}}",
      "وقت الخروج: {{logoutTime}}",
      "ملاحظات: {{notes}}",
    ].join("\n"),
  },
  warning: {
    key: "warning",
    label: "Warning Issued",
    description: "Posted to the warning log channel whenever a warning is created.",
    placeholders: ["playerRef", "warningNumber", "reason", "issuedDate", "duration", "staffName", "staffMention", "staffRole"],
    default: [
      "**يتم تسجيل الورنيج بالصيغة التالية:**",
      "اسم اللاعب: {{playerRef}}",
      "رقم الورنيج: warning {{warningNumber}}",
      "سبب الورنيج: {{reason}}",
      "تاريخ الإصدار: {{issuedDate}}",
      "مدة الورنيج: {{duration}}",
      "اسم الرقابي: {{staffMention}} ({{staffRole}})",
    ].join("\n"),
  },
  ban: {
    key: "ban",
    label: "Ban Issued",
    description: "Posted to the ban log channel whenever a ban is created.",
    placeholders: ["identifier", "playerMention", "duration", "reason", "date", "staffMention", "staffRole"],
    default: [
      "player id : {{identifier}}",
      "اللاعب: {{playerMention}}",
      "band: {{duration}}",
      "Reason: {{reason}}",
      "date: {{date}}",
      "band time : {{duration}}",
      "censorhip name: {{staffMention}} ({{staffRole}})",
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
