import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { verifyCsrf } from "../middleware/csrf.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { writeRateLimit } from "../middleware/rateLimit.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import { startDuty, endDuty, getActiveDutySession, listOnDutyStaff, listStaffSessionHistory, DutyConflictError } from "../../staff/sessions.service.js";
import { ApiError } from "../middleware/errorHandler.js";
import { toCsv } from "../../utils/csv.js";

export const sessionsRouter = Router();

sessionsRouter.use(requireAuth);

sessionsRouter.get("/status", async (req, res, next) => {
  try {
    const active = await getActiveDutySession(req.auth!.discordUserId);
    res.json({ onDuty: Boolean(active), session: active ?? null });
  } catch (err) {
    next(err);
  }
});

sessionsRouter.get("/on-duty", requirePermission(PERMISSIONS.DUTY_TOGGLE), async (_req, res, next) => {
  try {
    const sessions = await listOnDutyStaff();
    res.json({ sessions });
  } catch (err) {
    next(err);
  }
});

sessionsRouter.get(
  "/history",
  requirePermission(PERMISSIONS.STAFF_VIEW),
  validateQuery(z.object({ staffUserId: z.string().optional(), limit: z.coerce.number().int().min(1).max(500).optional() })),
  async (req, res, next) => {
    try {
      const { staffUserId, limit } = req.query as unknown as { staffUserId?: string; limit?: number };
      const sessions = await listStaffSessionHistory(staffUserId, limit);
      res.json({ sessions });
    } catch (err) {
      next(err);
    }
  },
);

sessionsRouter.get("/export", requirePermission(PERMISSIONS.DATA_EXPORT), async (_req, res, next) => {
  try {
    const sessions = await listStaffSessionHistory(undefined, 5000);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=staff-sessions.csv");
    res.send(toCsv(sessions as unknown as Record<string, unknown>[]));
  } catch (err) {
    next(err);
  }
});

sessionsRouter.post("/login", verifyCsrf, requirePermission(PERMISSIONS.DUTY_TOGGLE), writeRateLimit, async (req, res, next) => {
  try {
    const created = await startDuty(req.auth!);
    res.status(201).json({ session: created });
  } catch (err) {
    if (err instanceof DutyConflictError) {
      return next(new ApiError(409, "duty_conflict", err.message));
    }
    next(err);
  }
});

sessionsRouter.post(
  "/logout",
  verifyCsrf,
  requirePermission(PERMISSIONS.DUTY_TOGGLE),
  writeRateLimit,
  validateBody(z.object({ notes: z.string().max(1000).optional() })),
  async (req, res, next) => {
    try {
      const updated = await endDuty(req.auth!, req.body.notes ?? null);
      res.json({ session: updated });
    } catch (err) {
      if (err instanceof DutyConflictError) {
        return next(new ApiError(409, "duty_conflict", err.message));
      }
      next(err);
    }
  },
);
