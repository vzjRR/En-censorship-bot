import { Router } from "express";
import path from "node:path";
import { requireAuth } from "../middleware/requireAuth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import { UPLOADS_DIR } from "../../evidence/localStorage.js";
import { ApiError } from "../middleware/errorHandler.js";

export const evidenceRouter = Router();

evidenceRouter.use(requireAuth);

/**
 * Serves locally-stored evidence (EVIDENCE_STORAGE_DRIVER=local only).
 * Requires an authenticated session with view access — evidence is
 * moderation-sensitive material, never publicly accessible.
 */
evidenceRouter.get(
  "/local/:key",
  requirePermission(PERMISSIONS.WARNINGS_VIEW),
  (req, res, next) => {
    const key = req.params.key;
    if (!/^[a-zA-Z0-9._-]+$/.test(key)) {
      return next(new ApiError(400, "invalid_key", "Invalid evidence key."));
    }
    const filePath = path.join(UPLOADS_DIR, key);
    res.sendFile(filePath, (err) => {
      if (err) next(new ApiError(404, "not_found", "Evidence file not found."));
    });
  },
);
