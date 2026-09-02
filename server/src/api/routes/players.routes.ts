import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateParams, validateQuery } from "../middleware/validate.js";
import { searchRateLimit } from "../middleware/rateLimit.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import { ApiError } from "../middleware/errorHandler.js";
import { searchPlayers, getPlayerProfile, getPlayerTimeline } from "../../moderation/players/players.service.js";
import { searchGuildMembers } from "../../bot/services/memberService.js";

export const playersRouter = Router();

playersRouter.use(requireAuth);

playersRouter.get(
  "/search",
  requirePermission(PERMISSIONS.PLAYERS_VIEW),
  searchRateLimit,
  validateQuery(z.object({ query: z.string().min(1).max(100) })),
  async (req, res, next) => {
    try {
      const { query } = req.query as unknown as { query: string };
      const results = await searchPlayers(query);
      res.json({ results });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Live Discord member search for the Warning/Ban "search player" flow — the
 * platform requirement that player identity be resolved from Discord, not
 * free-typed. Separate from /staff/search-discord (which is gated to
 * staff.manage): any staff who can issue a warning/ban needs this too.
 */
playersRouter.get(
  "/search-discord",
  requirePermission(PERMISSIONS.PLAYERS_VIEW),
  searchRateLimit,
  validateQuery(z.object({ query: z.string().min(1).max(100) })),
  async (req, res, next) => {
    try {
      const { query } = req.query as unknown as { query: string };
      const results = await searchGuildMembers(query);
      res.json({ results });
    } catch (err) {
      next(err);
    }
  },
);

playersRouter.get(
  "/:id",
  requirePermission(PERMISSIONS.PLAYERS_VIEW),
  validateParams(z.object({ id: z.string().uuid() })),
  async (req, res, next) => {
    try {
      const [profile, timeline] = await Promise.all([
        getPlayerProfile(req.params.id),
        getPlayerTimeline(req.params.id),
      ]);
      if (!profile) throw new ApiError(404, "not_found", "Player not found.");

      const activeWarnings = profile.warnings.filter((w) => w.status === "ACTIVE").length;
      const expiredWarnings = profile.warnings.filter((w) => w.status === "EXPIRED").length;
      const activeBan = profile.bans.find((b) => b.status === "ACTIVE") ?? null;
      const expiredBans = profile.bans.filter((b) => b.status === "EXPIRED").length;

      res.json({
        player: profile.player,
        warnings: profile.warnings,
        bans: profile.bans,
        activeWarnings,
        expiredWarnings,
        activeBan,
        expiredBans,
        totalActions: profile.warnings.length + profile.bans.length,
        timeline,
      });
    } catch (err) {
      next(err);
    }
  },
);
