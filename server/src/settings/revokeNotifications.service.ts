import { getSetting, setSetting } from "./settings.service.js";

export const REVOKE_NOTIFICATIONS_KEY = "revoke_notifications";

export interface RevokeNotificationsConfig {
  warningEnabled: boolean;
  banEnabled: boolean;
}

const DEFAULT_CONFIG: RevokeNotificationsConfig = { warningEnabled: true, banEnabled: true };

/**
 * Whether revoking a warning/ban should post a Discord notification at all
 * — separate from the wording of that notification (see
 * settings/templates.service.ts's warning_revoked/ban_revoked templates).
 * Editable by anyone with messages.manage (owner, Manager, Deputy Manager).
 */
export async function getRevokeNotificationsConfig(): Promise<RevokeNotificationsConfig> {
  const config = await getSetting<RevokeNotificationsConfig>(REVOKE_NOTIFICATIONS_KEY);
  return config ?? DEFAULT_CONFIG;
}

export async function setRevokeNotificationsConfig(config: RevokeNotificationsConfig, updatedBy: string): Promise<void> {
  await setSetting(REVOKE_NOTIFICATIONS_KEY, config, updatedBy);
}
