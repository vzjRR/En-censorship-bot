/**
 * Canonical set of platform permissions. Staff roles store a subset of these
 * as a JSON array (staff_roles.permissions), editable by the Platform Owner
 * through Settings. The Platform Owner always implicitly holds every
 * permission regardless of what is stored in the database.
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",

  STAFF_VIEW: "staff.view",
  STAFF_MANAGE: "staff.manage",

  DUTY_TOGGLE: "duty.toggle",
  DUTY_VIEW_ALL: "duty.view_all",

  WARNINGS_VIEW: "warnings.view",
  WARNINGS_CREATE: "warnings.create",
  WARNINGS_REVOKE: "warnings.revoke",

  BANS_VIEW: "bans.view",
  BANS_CREATE: "bans.create",
  BANS_REVOKE: "bans.revoke",

  PLAYERS_VIEW: "players.view",

  STATISTICS_VIEW: "statistics.view",

  AUDIT_VIEW: "audit.view",

  SETTINGS_MANAGE: "settings.manage",
  MESSAGES_MANAGE: "messages.manage",
  CHANNELS_MANAGE: "channels.manage",
  TEST_MODE_MANAGE: "test_mode.manage",

  DATA_EXPORT: "data.export",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/** Human-readable (Arabic) description of what each permission lets someone do — used in the staff welcome DM. */
export const PERMISSION_LABELS_AR: Record<string, string> = {
  [PERMISSIONS.DASHBOARD_VIEW]: "عرض لوحة التحكم الرئيسية",
  [PERMISSIONS.STAFF_VIEW]: "عرض قائمة الطاقم",
  [PERMISSIONS.STAFF_MANAGE]: "إضافة/إزالة الطاقم وتغيير رتبهم",
  [PERMISSIONS.DUTY_TOGGLE]: "تسجيل دخول وخروج الرقابة",
  [PERMISSIONS.DUTY_VIEW_ALL]: "عرض كل الرقابة الحاليين بالخدمة",
  [PERMISSIONS.WARNINGS_VIEW]: "عرض التحذيرات (الورنينج)",
  [PERMISSIONS.WARNINGS_CREATE]: "إصدار تحذير",
  [PERMISSIONS.WARNINGS_REVOKE]: "إلغاء تحذير",
  [PERMISSIONS.BANS_VIEW]: "عرض الحظر (الباند)",
  [PERMISSIONS.BANS_CREATE]: "إصدار باند",
  [PERMISSIONS.BANS_REVOKE]: "إلغاء باند",
  [PERMISSIONS.PLAYERS_VIEW]: "البحث عن اللاعبين وعرض ملفاتهم",
  [PERMISSIONS.STATISTICS_VIEW]: "عرض الإحصائيات",
  [PERMISSIONS.AUDIT_VIEW]: "عرض سجل النشاطات",
  [PERMISSIONS.SETTINGS_MANAGE]: "إدارة إعدادات المنصة الكاملة",
  [PERMISSIONS.MESSAGES_MANAGE]: "تعديل نصوص الرسائل المرسلة لديسكورد",
  [PERMISSIONS.CHANNELS_MANAGE]: "إدارة توجيه القنوات",
  [PERMISSIONS.TEST_MODE_MANAGE]: "تفعيل/تعطيل وضع الاختبار",
  [PERMISSIONS.DATA_EXPORT]: "تصدير البيانات (CSV)",
};

/** Bullet-list Arabic summary of what a set of permissions lets someone do — used in the staff welcome DM. */
export function formatPermissionsListAr(permissions: string[]): string {
  const labels = permissions.map((p) => PERMISSION_LABELS_AR[p]).filter((l): l is string => Boolean(l));
  if (labels.length === 0) return "لا توجد صلاحيات محددة حاليًا.";
  return labels.map((l) => `• ${l}`).join("\n");
}

/** Reserved staff_roles.key for the auto-provisioned Platform Owner bookkeeping record. */
export const PLATFORM_OWNER_ROLE_KEY = "platform_owner";

export const DEFAULT_ROLE_SEEDS: Array<{
  key: string;
  name: string;
  rank: number;
  permissions: Permission[];
  isSystem: boolean;
}> = [
  {
    key: "manager",
    name: "Manager",
    rank: 10,
    isSystem: true,
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.STAFF_VIEW,
      PERMISSIONS.STAFF_MANAGE,
      PERMISSIONS.DUTY_TOGGLE,
      PERMISSIONS.DUTY_VIEW_ALL,
      PERMISSIONS.WARNINGS_VIEW,
      PERMISSIONS.WARNINGS_CREATE,
      PERMISSIONS.WARNINGS_REVOKE,
      PERMISSIONS.BANS_VIEW,
      PERMISSIONS.BANS_CREATE,
      PERMISSIONS.BANS_REVOKE,
      PERMISSIONS.PLAYERS_VIEW,
      PERMISSIONS.STATISTICS_VIEW,
      PERMISSIONS.AUDIT_VIEW,
      PERMISSIONS.SETTINGS_MANAGE,
      PERMISSIONS.MESSAGES_MANAGE,
      PERMISSIONS.CHANNELS_MANAGE,
      PERMISSIONS.TEST_MODE_MANAGE,
      PERMISSIONS.DATA_EXPORT,
    ],
  },
  {
    key: "deputy_manager",
    name: "Deputy Manager",
    rank: 20,
    isSystem: true,
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.STAFF_VIEW,
      PERMISSIONS.DUTY_TOGGLE,
      PERMISSIONS.DUTY_VIEW_ALL,
      PERMISSIONS.WARNINGS_VIEW,
      PERMISSIONS.WARNINGS_CREATE,
      PERMISSIONS.WARNINGS_REVOKE,
      PERMISSIONS.BANS_VIEW,
      PERMISSIONS.BANS_CREATE,
      PERMISSIONS.BANS_REVOKE,
      PERMISSIONS.PLAYERS_VIEW,
      PERMISSIONS.STATISTICS_VIEW,
      PERMISSIONS.AUDIT_VIEW,
    ],
  },
  {
    key: "staff",
    name: "Staff",
    rank: 30,
    isSystem: true,
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.DUTY_TOGGLE,
      PERMISSIONS.WARNINGS_VIEW,
      PERMISSIONS.WARNINGS_CREATE,
      PERMISSIONS.BANS_VIEW,
      PERMISSIONS.BANS_CREATE,
      PERMISSIONS.PLAYERS_VIEW,
    ],
  },
];
