import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { requirePermission, requirePlatformOwner } from "../middleware/requirePermission.js";
import { verifyCsrf } from "../middleware/csrf.js";
import { adminRateLimit } from "../middleware/rateLimit.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import { listSettings, setSetting } from "../../settings/settings.service.js";
import { discordConfig } from "../../config/discordConfig.js";
import { DISPLAY_TIMEZONE } from "../../utils/timezone.js";
import { recordAuditLog, AUDIT_ACTIONS } from "../../audit/audit.service.js";
import { isBotReady } from "../../bot/client.js";
import { ApiError } from "../middleware/errorHandler.js";
import {
  TEMPLATE_DEFINITIONS,
  getTemplateOverrides,
  setTemplateOverride,
  resetTemplateOverride,
  type TemplateKey,
} from "../../settings/templates.service.js";
import { getCustomChannelRouting, CHANNEL_ROUTING_KEY, TEST_MODE_KEY } from "../../settings/runtimeConfig.service.js";
import { listGuildTextChannels, listGuildRoles } from "../../bot/services/memberService.js";
import { enableTestMode, disableTestMode, getTestModeStatus, TestModeError } from "../../settings/testMode.service.js";
import { wipeData, validateWipeSelection, DataWipeError, WIPE_CATEGORIES, WIPE_CATEGORY_LABELS } from "../../settings/dataWipe.service.js";
import { getPunishmentRolesConfig, setPunishmentRolesConfig, PUNISHMENT_ROLES_KEY } from "../../settings/punishmentRoles.service.js";

const RESERVED_SETTINGS_KEYS = new Set([CHANNEL_ROUTING_KEY, TEST_MODE_KEY, "message_templates", PUNISHMENT_ROLES_KEY]);

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

// ---------------------------------------------------------------------------
// Message templates ("Edit the messages")
// ---------------------------------------------------------------------------
settingsRouter.get("/templates", requirePermission(PERMISSIONS.MESSAGES_MANAGE), async (_req, res, next) => {
  try {
    const overrides = await getTemplateOverrides();
    const templates = Object.values(TEMPLATE_DEFINITIONS).map((def) => ({
      key: def.key,
      label: def.label,
      description: def.description,
      placeholders: def.placeholders,
      default: def.default,
      current: overrides[def.key] ?? def.default,
      isCustom: Boolean(overrides[def.key]),
    }));
    res.json({ templates });
  } catch (err) {
    next(err);
  }
});

settingsRouter.put(
  "/templates/:key",
  verifyCsrf,
  requirePermission(PERMISSIONS.MESSAGES_MANAGE),
  adminRateLimit,
  validateParams(z.object({ key: z.enum(Object.keys(TEMPLATE_DEFINITIONS) as [TemplateKey, ...TemplateKey[]]) })),
  validateBody(z.object({ template: z.string().max(2000) })),
  async (req, res, next) => {
    try {
      const key = req.params.key as TemplateKey;
      if (req.body.template.trim() === "") {
        await resetTemplateOverride(key, req.auth!.discordUserId);
      } else {
        await setTemplateOverride(key, req.body.template, req.auth!.discordUserId);
      }
      await recordAuditLog({
        actorDiscordId: req.auth!.discordUserId,
        actorName: req.auth!.displayName,
        action: AUDIT_ACTIONS.MESSAGE_TEMPLATE_UPDATED,
        targetType: "message_template",
        targetId: key,
        metadata: { template: req.body.template },
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Channel routing ("choose which channel to send what")
// ---------------------------------------------------------------------------
settingsRouter.get("/channels", requirePermission(PERMISSIONS.CHANNELS_MANAGE), async (_req, res, next) => {
  try {
    const [routing, guildChannels] = await Promise.all([
      getCustomChannelRouting(),
      listGuildTextChannels().catch(() => []),
    ]);
    res.json({
      routing: {
        staffLog: routing?.staffLog || discordConfig.channels.staffLog,
        warningLog: routing?.warningLog || discordConfig.channels.warningLog,
        banLog: routing?.banLog || discordConfig.channels.banLog,
      },
      defaults: discordConfig.channels,
      guildChannels,
    });
  } catch (err) {
    next(err);
  }
});

const channelRoutingSchema = z.object({
  staffLog: z.string().regex(/^\d{15,25}$/).optional(),
  warningLog: z.string().regex(/^\d{15,25}$/).optional(),
  banLog: z.string().regex(/^\d{15,25}$/).optional(),
});

settingsRouter.put(
  "/channels",
  verifyCsrf,
  requirePermission(PERMISSIONS.CHANNELS_MANAGE),
  adminRateLimit,
  validateBody(channelRoutingSchema),
  async (req, res, next) => {
    try {
      const existing = await getCustomChannelRouting();
      const updated = { ...existing, ...req.body };
      await setSetting(CHANNEL_ROUTING_KEY, updated, req.auth!.discordUserId);
      await recordAuditLog({
        actorDiscordId: req.auth!.discordUserId,
        actorName: req.auth!.displayName,
        action: AUDIT_ACTIONS.CHANNEL_ROUTING_UPDATED,
        targetType: "channel_routing",
        metadata: updated,
      });
      res.json({ ok: true, routing: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Test Mode
// ---------------------------------------------------------------------------
settingsRouter.get("/test-mode", requirePermission(PERMISSIONS.TEST_MODE_MANAGE), async (_req, res, next) => {
  try {
    const state = await getTestModeStatus();
    res.json({ state: state ?? null });
  } catch (err) {
    next(err);
  }
});

settingsRouter.post(
  "/test-mode/enable",
  verifyCsrf,
  requirePermission(PERMISSIONS.TEST_MODE_MANAGE),
  adminRateLimit,
  validateBody(z.object({ guildId: z.string().regex(/^\d{15,25}$/, "Invalid Discord server ID") })),
  async (req, res, next) => {
    try {
      const state = await enableTestMode(req.body.guildId, { discordId: req.auth!.discordUserId, name: req.auth!.displayName });
      res.status(201).json({ state });
    } catch (err) {
      if (err instanceof TestModeError) return next(new ApiError(400, "test_mode_error", err.message));
      next(err);
    }
  },
);

settingsRouter.post(
  "/test-mode/disable",
  verifyCsrf,
  requirePermission(PERMISSIONS.TEST_MODE_MANAGE),
  adminRateLimit,
  validateBody(z.object({ cleanup: z.boolean().optional() })),
  async (req, res, next) => {
    try {
      const result = await disableTestMode(
        { discordId: req.auth!.discordUserId, name: req.auth!.displayName },
        req.body.cleanup ?? true,
      );
      res.json(result);
    } catch (err) {
      if (err instanceof TestModeError) return next(new ApiError(400, "test_mode_error", err.message));
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Punishment roles — the Discord role granted to a player while a warning
// (per warning number) or ban of theirs is active. Owner-only, never
// delegable through the permission system, per platform requirement.
// ---------------------------------------------------------------------------
const punishmentRolesSchema = z.object({
  warningRoles: z
    .array(
      z.object({
        warningNumber: z.number().int().min(1).max(999),
        discordRoleId: z.string().regex(/^\d{15,25}$/),
        discordRoleName: z.string().min(1).max(200),
      }),
    )
    .max(50),
  banRole: z
    .object({
      discordRoleId: z.string().regex(/^\d{15,25}$/),
      discordRoleName: z.string().min(1).max(200),
    })
    .nullable(),
});

settingsRouter.get("/punishment-roles", requirePlatformOwner, async (_req, res, next) => {
  try {
    const [config, guildRoles] = await Promise.all([getPunishmentRolesConfig(), listGuildRoles().catch(() => [])]);
    res.json({ config, guildRoles });
  } catch (err) {
    next(err);
  }
});

settingsRouter.put(
  "/punishment-roles",
  verifyCsrf,
  requirePlatformOwner,
  adminRateLimit,
  validateBody(punishmentRolesSchema),
  async (req, res, next) => {
    try {
      const warningNumbers = req.body.warningRoles.map((r: { warningNumber: number }) => r.warningNumber);
      if (new Set(warningNumbers).size !== warningNumbers.length) {
        throw new ApiError(400, "duplicate_warning_number", "Each warning number can only have one role rule.");
      }
      await setPunishmentRolesConfig(req.body, req.auth!.discordUserId);
      await recordAuditLog({
        actorDiscordId: req.auth!.discordUserId,
        actorName: req.auth!.displayName,
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        targetType: "punishment_roles",
        metadata: req.body,
      });
      res.json({ ok: true, config: req.body });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Data wipe — owner-only, never delegable through the permission system.
// ---------------------------------------------------------------------------
settingsRouter.get("/data-wipe/categories", requirePlatformOwner, (_req, res) => {
  res.json({ categories: WIPE_CATEGORIES.map((key) => ({ key, label: WIPE_CATEGORY_LABELS[key] })) });
});

settingsRouter.post(
  "/data-wipe",
  verifyCsrf,
  requirePlatformOwner,
  adminRateLimit,
  validateBody(
    z.object({
      categories: z.array(z.enum(WIPE_CATEGORIES)).min(1),
      confirm: z.literal(true),
    }),
  ),
  async (req, res, next) => {
    try {
      validateWipeSelection(req.body.categories);
      const result = await wipeData({
        categories: req.body.categories,
        actor: { discordId: req.auth!.discordUserId, name: req.auth!.displayName },
      });

      // Written AFTER the wipe transaction commits so this entry survives
      // even when "audit_logs" itself was one of the wiped categories.
      await recordAuditLog({
        actorDiscordId: req.auth!.discordUserId,
        actorName: req.auth!.displayName,
        action: AUDIT_ACTIONS.DATA_WIPED,
        targetType: "data_wipe",
        metadata: { categories: result.categories, rowsDeleted: result.rowsDeleted, testModeCleanupErrors: result.testModeCleanupErrors },
      });

      res.json(result);
    } catch (err) {
      if (err instanceof DataWipeError) return next(new ApiError(400, "data_wipe_error", err.message));
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Generic settings key/value writer — registered LAST. It matches any
// single-segment PUT path (e.g. PUT /some-key), so every more specific route
// above (PUT /channels, PUT /templates/:key, ...) must be registered before
// this one or Express would route requests meant for them here instead.
// ---------------------------------------------------------------------------
settingsRouter.put(
  "/:key",
  verifyCsrf,
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  adminRateLimit,
  validateParams(z.object({ key: z.string().min(1).max(100) })),
  validateBody(z.object({ value: z.unknown() })),
  async (req, res, next) => {
    try {
      if (RESERVED_SETTINGS_KEYS.has(req.params.key)) {
        throw new ApiError(
          400,
          "reserved_key",
          `"${req.params.key}" is managed through its dedicated endpoint (Messages, Channels, or Test Mode in Settings), not the generic settings writer.`,
        );
      }
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
