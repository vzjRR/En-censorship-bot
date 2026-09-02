export interface SessionUser {
  discordUserId: string;
  discordUsername: string;
  displayName: string;
  avatarHash: string | null;
  isPlatformOwner: boolean;
  staffId: string | null;
  roleKey: string;
  roleName: string;
  permissions: string[];
  discordRoleIds: string[];
  discordRoleName: string | null;
  rolesSyncedAt: string;
}

export interface StaffRole {
  id: string;
  key: string;
  name: string;
  rank: number;
  permissions: string[];
  requiredDiscordRoleId: string | null;
  isSystem: boolean;
}

export interface StaffMember {
  id: string;
  discordUserId: string;
  discordUsername: string;
  displayName: string;
  roleId: string;
  discordRoleIds: string[];
  discordRoleId: string | null;
  discordRoleName: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
  role: StaffRole;
}

export interface StaffSession {
  id: string;
  staffId: string;
  staffUserId: string;
  staffName: string;
  staffRole: string;
  loginTime: string;
  logoutTime: string | null;
  notes: string | null;
  status: "ACTIVE" | "COMPLETED";
}

export type ModerationStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export interface Warning {
  id: string;
  warningCode: string;
  playerId: string;
  warningNumber: number;
  reason: string;
  durationType: string;
  durationHours: number | null;
  issuedAt: string;
  expiresAt: string | null;
  status: ModerationStatus;
  issuedByName: string;
  revokedReason: string | null;
  revokedAt: string | null;
  discordLogStatus: "PENDING" | "SENT" | "FAILED";
}

export interface Ban {
  id: string;
  banCode: string;
  playerId: string;
  fivemIdentifier: string | null;
  discordUserId: string | null;
  playerName: string;
  reason: string;
  durationType: string;
  durationHours: number | null;
  issuedAt: string;
  expiresAt: string | null;
  status: ModerationStatus;
  issuedByName: string;
  revokedReason: string | null;
  revokedAt: string | null;
  discordLogStatus: "PENDING" | "SENT" | "FAILED";
}

export interface Player {
  id: string;
  discordUserId: string | null;
  discordUsername: string | null;
  fivemIdentifier: string | null;
  playerName: string;
}

export interface TimelineEvent {
  date: string;
  type: string;
  refCode: string;
  summary: string;
  staffName?: string | null;
}

export interface AuditLog {
  id: string;
  actorDiscordId: string | null;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export const DURATION_OPTIONS_WARNING = [
  { value: "1_day", label: "1 Day" },
  { value: "3_days", label: "3 Days" },
  { value: "7_days", label: "7 Days" },
  { value: "14_days", label: "14 Days" },
  { value: "30_days", label: "30 Days" },
  { value: "PERMANENT", label: "Permanent" },
  { value: "CUSTOM", label: "Custom" },
];

export const DURATION_OPTIONS_BAN = [
  { value: "1_hour", label: "1 Hour" },
  { value: "6_hours", label: "6 Hours" },
  { value: "12_hours", label: "12 Hours" },
  { value: "1_day", label: "1 Day" },
  { value: "3_days", label: "3 Days" },
  { value: "7_days", label: "7 Days" },
  { value: "14_days", label: "14 Days" },
  { value: "30_days", label: "30 Days" },
  { value: "PERMANENT", label: "Permanent" },
  { value: "CUSTOM", label: "Custom" },
];

export const WARNING_REASON_PRESETS = ["RDM", "VDM", "Fail RP", "Toxicity", "Power Gaming"];

export interface MessageTemplate {
  key: "staff_login" | "staff_logout" | "warning" | "ban" | "warning_revoked" | "ban_revoked";
  label: string;
  description: string;
  placeholders: string[];
  default: string;
  current: string;
  isCustom: boolean;
}

export interface ChannelRouting {
  staffLog: string;
  warningLog: string;
  banLog: string;
}

export interface GuildTextChannel {
  id: string;
  name: string;
  categoryName: string | null;
}

export interface TestModeState {
  enabled: boolean;
  guildId: string;
  categoryId: string | null;
  channels: ChannelRouting;
  enabledAt: string;
  enabledBy: string;
}

export interface DataWipeCategory {
  key: string;
  label: string;
}

export interface DataWipeResult {
  categories: string[];
  rowsDeleted: Record<string, number>;
  testModeCleanupErrors: string[];
}

export interface GuildRole {
  id: string;
  name: string;
}

export interface PunishmentRoleRule {
  warningNumber: number;
  discordRoleId: string;
  discordRoleName: string;
}

export interface PunishmentRolesConfig {
  warningRoles: PunishmentRoleRule[];
  banRole: { discordRoleId: string; discordRoleName: string } | null;
}
