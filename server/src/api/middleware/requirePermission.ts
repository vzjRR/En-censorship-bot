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
