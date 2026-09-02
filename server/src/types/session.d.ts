import "express-session";

export interface AuthenticatedSessionUser {
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
  /**
   * The specific Discord role chosen to represent this person as staff —
   * separate from roleName (the platform permission level). Used in Discord
   * moderation messages; null until an admin assigns one via Add/Edit Staff.
   */
  discordRoleName: string | null;
  /** The Discord role ID behind discordRoleName — used to build a role mention (<@&id>) so it renders in the role's own color. */
  discordRoleId: string | null;
  rolesSyncedAt: string;
}

declare module "express-session" {
  interface SessionData {
    oauthState?: string;
    oauthReturnTo?: string;
    csrfToken?: string;
    user?: AuthenticatedSessionUser;
  }
}
