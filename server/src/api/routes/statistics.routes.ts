import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import {
  getDashboardOverview,
  getPeriodStatistics,
  getMostActiveStaff,
  getMostWarnedPlayers,
  getMostCommonWarningReasons,
  getStaffPersonalStatistics,
} from "../../statistics/statistics.service.js";
import { listOnDutyStaff } from "../../staff/sessions.service.js";

export const statisticsRouter = Router();

statisticsRouter.use(requireAuth);

statisticsRouter.get("/overview", requirePermission(PERMISSIONS.DASHBOARD_VIEW), async (_req, res, next) => {
  try {
    const [overview, onDuty] = await Promise.all([getDashboardOverview(), listOnDutyStaff()]);
    res.json({ ...overview, onDutyStaff: onDuty });
  } catch (err) {
    next(err);
  }
});

statisticsRouter.get("/detailed", requirePermission(PERMISSIONS.STATISTICS_VIEW), async (_req, res, next) => {
  try {
    const [period, staffLeaderboard, mostWarnedPlayers, commonReasons] = await Promise.all([
      getPeriodStatistics(),
      getMostActiveStaff(),
      getMostWarnedPlayers(),
      getMostCommonWarningReasons(),
    ]);
    res.json({ period, staffLeaderboard, mostWarnedPlayers, commonReasons });
  } catch (err) {
    next(err);
  }
});

statisticsRouter.get("/me", async (req, res, next) => {
  try {
    const stats = await getStaffPersonalStatistics(req.auth!.discordUserId, req.auth!.displayName);
    res.json({ stats });
  } catch (err) {
    next(err);
  }
});
