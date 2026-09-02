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
