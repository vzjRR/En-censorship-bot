import type { Request, Response, NextFunction } from "express";
import { hasPermission } from "../../auth/authorization.js";
import type { Permission } from "../../auth/permissions.js";

/** Must run after requireAuth. Never trusts any client-supplied role/permission data. */
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: "unauthenticated" });
    }
    if (!hasPermission(req.auth, permission)) {
      return res.status(403).json({ error: "forbidden", message: `Missing required permission: ${permission}` });
    }
    next();
  };
}

/**
 * Gates actions too destructive to delegate through the permission system
 * (e.g. wiping data) — checks `req.auth.isPlatformOwner` directly rather
 * than a grantable permission, since no role, including Manager, should be
 * able to grant itself this. Must run after requireAuth.
 */
export function requirePlatformOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    return res.status(401).json({ error: "unauthenticated" });
  }
  if (!req.auth.isPlatformOwner) {
    return res.status(403).json({ error: "forbidden", message: "Only the platform owner can perform this action." });
  }
  next();
}
