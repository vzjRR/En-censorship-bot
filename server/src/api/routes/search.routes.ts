import { Router } from "express";
import { z } from "zod";
import { ilike, or, eq } from "drizzle-orm";
import { requireAuth } from "../middleware/requireAuth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateQuery } from "../middleware/validate.js";
import { searchRateLimit } from "../middleware/rateLimit.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import { db } from "../../database/client.js";
import { warnings, bans } from "../../database/schema/index.js";
import { searchPlayers } from "../../moderation/players/players.service.js";

export const searchRouter = Router();

searchRouter.use(requireAuth);

/**
 * Global search across Discord ID/username, player name, FiveM identifier,
 * warning ID, and ban ID — one box, several backing queries fanned out in
 * parallel.
 */
searchRouter.get(
  "/",
  requirePermission(PERMISSIONS.PLAYERS_VIEW),
  searchRateLimit,
  validateQuery(z.object({ query: z.string().min(1).max(100) })),
  async (req, res, next) => {
    try {
      const { query } = req.query as unknown as { query: string };
      const q = `%${query.trim()}%`;

      const [players, matchedWarnings, matchedBans] = await Promise.all([
        searchPlayers(query, 10),
        db
          .select()
          .from(warnings)
          .where(or(ilike(warnings.warningCode, q), eq(warnings.warningCode, query.trim())))
          .limit(10),
        db
          .select()
          .from(bans)
          .where(or(ilike(bans.banCode, q), eq(bans.banCode, query.trim())))
          .limit(10),
      ]);

      res.json({ players, warnings: matchedWarnings, bans: matchedBans });
    } catch (err) {
      next(err);
    }
  },
);
