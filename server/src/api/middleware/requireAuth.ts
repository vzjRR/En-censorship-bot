import type { Request, Response, NextFunction } from "express";
import { discordConfig } from "../../config/discordConfig.js";
import { findStaffById } from "../../staff/staff.service.js";
import { ALL_PERMISSIONS, type Permission } from "../../auth/permissions.js";

/**
 * Verifies the caller has a valid session AND re-validates their staff
 * status/permissions against the database on every request. This keeps
 * "remove staff" / "change role" effective immediately, without waiting for
 * the session to expire or the user to log in again.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sessionUser = req.session.user;
  if (!sessionUser) {
    return res.status(401).json({ error: "unauthenticated", message: "Login required." });
  }

  if (sessionUser.isPlatformOwner || sessionUser.discordUserId === discordConfig.platformOwnerId) {
    req.auth = { ...sessionUser, isPlatformOwner: true, permissions: ALL_PERMISSIONS as Permission[] };
    return next();
  }

  if (!sessionUser.staffId) {
    return res.status(403).json({ error: "forbidden", message: "No staff record associated with this session." });
  }

  const staff = await findStaffById(sessionUser.staffId);
  if (!staff || staff.status !== "ACTIVE") {
    req.session.destroy(() => {});
    return res.status(403).json({ error: "access_revoked", message: "Your staff access has been revoked." });
  }

  if (
    staff.role.requiredDiscordRoleId &&
    !sessionUser.discordRoleIds.includes(staff.role.requiredDiscordRoleId)
  ) {
    req.session.destroy(() => {});
    return res.status(403).json({
      error: "discord_role_missing",
      message: "You no longer hold the Discord role required for your staff position.",
    });
  }

  // Keep the session's view of role/permissions fresh in case an admin
  // changed them since the session was created.
  req.session.user = {
    ...sessionUser,
    displayName: staff.displayName,
    roleKey: staff.role.key,
    roleName: staff.role.name,
    permissions: staff.role.permissions,
  };
  req.auth = req.session.user;
  next();
}
