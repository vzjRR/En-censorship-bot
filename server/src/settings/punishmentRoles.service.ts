import { getSetting, setSetting } from "./settings.service.js";

export const PUNISHMENT_ROLES_KEY = "punishment_roles";

export interface PunishmentRoleRule {
  warningNumber: number;
  discordRoleId: string;
  discordRoleName: string;
}

export interface PunishmentBanRole {
  discordRoleId: string;
  discordRoleName: string;
}

export interface PunishmentRolesConfig {
  warningRoles: PunishmentRoleRule[];
  banRole: PunishmentBanRole | null;
}

const EMPTY_CONFIG: PunishmentRolesConfig = { warningRoles: [], banRole: null };

/**
 * The Discord role a player is temporarily given while a warning/ban of
 * theirs is active (e.g. "Warning 1", "Banned") — separate from staff
 * roles entirely. Owner-only to configure (see requirePlatformOwner on the
 * settings routes); reused as-is by createWarning/createBan.
 */
export async function getPunishmentRolesConfig(): Promise<PunishmentRolesConfig> {
  const config = await getSetting<PunishmentRolesConfig>(PUNISHMENT_ROLES_KEY);
  return config ?? EMPTY_CONFIG;
}

export async function setPunishmentRolesConfig(config: PunishmentRolesConfig, updatedBy: string): Promise<void> {
  await setSetting(PUNISHMENT_ROLES_KEY, config, updatedBy);
}

export function findWarningRoleRule(config: PunishmentRolesConfig, warningNumber: number): PunishmentRoleRule | undefined {
  return config.warningRoles.find((rule) => rule.warningNumber === warningNumber);
}
