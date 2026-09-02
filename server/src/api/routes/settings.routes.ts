import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { verifyCsrf } from "../middleware/csrf.js";
import { adminRateLimit } from "../middleware/rateLimit.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import { listSettings, setSetting } from "../../settings/settings.service.js";
import { discordConfig } from "../../config/discordConfig.js";
import { DISPLAY_TIMEZONE } from "../../utils/timezone.js";
import { recordAuditLog, AUDIT_ACTIONS } from "../../audit/audit.service.js";
import { isBotReady } from "../../bot/client.js";

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

/** Read-only view of the non-secret platform configuration (Discord IDs, timezone, bot status). */
settingsRouter.get("/config", requirePermission(PERMISSIONS.SETTINGS_MANAGE), (_req, res) => {
  res.json({
    platformOwnerId: discordConfig.platformOwnerId,
    botId: discordConfig.botId,
    guildId: discordConfig.guildId,
    channels: discordConfig.channels,
    timezone: DISPLAY_TIMEZONE,
    botConnected: isBotReady(),
  });
});

settingsRouter.get("/", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (_req, res, next) => {
  try {
    const settings = await listSettings();
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

settingsRouter.put(
  "/:key",
  verifyCsrf,
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  adminRateLimit,
  validateParams(z.object({ key: z.string().min(1).max(100) })),
  validateBody(z.object({ value: z.unknown() })),
  async (req, res, next) => {
    try {
      await setSetting(req.params.key, req.body.value, req.auth!.discordUserId);
      await recordAuditLog({
        actorDiscordId: req.auth!.discordUserId,
        actorName: req.auth!.displayName,
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        targetType: "system_setting",
        targetId: req.params.key,
        metadata: { value: req.body.value },
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);
