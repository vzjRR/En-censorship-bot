import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { verifyCsrf } from "../middleware/csrf.js";
import { validateParams, validateQuery } from "../middleware/validate.js";
import { evidenceUpload } from "../middleware/upload.js";
import { writeRateLimit } from "../middleware/rateLimit.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import { ApiError } from "../middleware/errorHandler.js";
import { EvidenceValidationError, EvidenceStorageError } from "../../evidence/storage.js";
import { NotOnDutyError } from "../../moderation/dutyGuard.js";
import { DURATION_TYPES } from "../../moderation/duration.js";
import {
  createWarning,
  revokeWarning,
  listWarnings,
  getWarningById,
  getWarningEvidence,
  suggestWarningNumber,
} from "../../moderation/warnings/warnings.service.js";
import { findOrCreatePlayer } from "../../moderation/players/players.service.js";
import { toCsv } from "../../utils/csv.js";

export const warningsRouter = Router();

warningsRouter.use(requireAuth);

const uuidSchema = z.string().uuid();

const createWarningFieldsSchema = z.object({
  playerDiscordId: z
    .string()
    .regex(/^\d{15,25}$/)
    .optional()
    .or(z.literal("")),
  playerName: z.string().min(1).max(100),
  fivemIdentifier: z.string().max(100).optional().or(z.literal("")),
  warningNumber: z.coerce.number().int().min(1).max(999).optional(),
  reason: z.string().min(1).max(500),
  durationType: z.enum(DURATION_TYPES as unknown as [string, ...string[]]),
  customDurationHours: z.coerce.number().int().positive().optional(),
  idempotencyKey: z.string().max(200).optional(),
});

warningsRouter.post(
  "/",
  verifyCsrf,
  requirePermission(PERMISSIONS.WARNINGS_CREATE),
  writeRateLimit,
  evidenceUpload.array("evidence", 5),
  async (req, res, next) => {
    try {
      const parsed = createWarningFieldsSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(400, "validation_error", parsed.error.issues.map((i) => i.message).join("; "));
      }
      const fields = parsed.data;
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];

      const warning = await createWarning(
        {
          playerDiscordId: fields.playerDiscordId || null,
          playerName: fields.playerName,
          fivemIdentifier: fields.fivemIdentifier || null,
          warningNumber: fields.warningNumber ?? null,
          reason: fields.reason,
          durationType: fields.durationType as any,
          customDurationHours: fields.customDurationHours ?? null,
          evidenceFiles: files.map((f) => ({ buffer: f.buffer, originalname: f.originalname, mimetype: f.mimetype, size: f.size })),
          idempotencyKey: fields.idempotencyKey || null,
        },
        req.auth!,
      );

      res.status(201).json({ warning });
    } catch (err) {
      if (err instanceof NotOnDutyError) return next(new ApiError(403, "not_on_duty", err.message));
      if (err instanceof EvidenceValidationError) return next(new ApiError(400, "invalid_evidence", err.message));
      if (err instanceof EvidenceStorageError) return next(new ApiError(502, "evidence_storage_failed", err.message));
      next(err);
    }
  },
);

warningsRouter.get(
  "/suggest-number",
  requirePermission(PERMISSIONS.WARNINGS_VIEW),
  validateQuery(
    z.object({
      playerDiscordId: z.string().optional(),
      playerName: z.string().optional(),
      fivemIdentifier: z.string().optional(),
    }),
  ),
  async (req, res, next) => {
    try {
      const { playerDiscordId, playerName, fivemIdentifier } = req.query as unknown as {
        playerDiscordId?: string;
        playerName?: string;
        fivemIdentifier?: string;
      };
      if (!playerDiscordId && !playerName && !fivemIdentifier) {
        return res.json({ previousWarnings: 0, suggested: 1 });
      }
      const player = await findOrCreatePlayer({
        discordUserId: playerDiscordId,
        fivemIdentifier,
        playerName: playerName ?? playerDiscordId ?? fivemIdentifier ?? "Unknown",
      });
      const suggestion = await suggestWarningNumber(player.id);
      res.json({ playerId: player.id, ...suggestion });
    } catch (err) {
      next(err);
    }
  },
);

warningsRouter.get(
  "/",
  requirePermission(PERMISSIONS.WARNINGS_VIEW),
  validateQuery(
    z.object({
      status: z.enum(["ACTIVE", "EXPIRED", "REVOKED"]).optional(),
      playerId: uuidSchema.optional(),
      limit: z.coerce.number().int().min(1).max(500).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    }),
  ),
  async (req, res, next) => {
    try {
      const filters = req.query as unknown as { status?: any; playerId?: string; limit?: number; offset?: number };
      const results = await listWarnings(filters);
      res.json({ warnings: results });
    } catch (err) {
      next(err);
    }
  },
);

warningsRouter.get("/export", requirePermission(PERMISSIONS.DATA_EXPORT), async (req, res, next) => {
  try {
    const results = await listWarnings({ limit: 5000 });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=warnings.csv");
    res.send(toCsv(results as unknown as Record<string, unknown>[]));
  } catch (err) {
    next(err);
  }
});

warningsRouter.get(
  "/:id",
  requirePermission(PERMISSIONS.WARNINGS_VIEW),
  validateParams(z.object({ id: uuidSchema })),
  async (req, res, next) => {
    try {
      const warning = await getWarningById(req.params.id);
      if (!warning) throw new ApiError(404, "not_found", "Warning not found.");
      const evidence = await getWarningEvidence(warning.id);
      res.json({ warning, evidence });
    } catch (err) {
      next(err);
    }
  },
);

warningsRouter.post(
  "/:id/revoke",
  verifyCsrf,
  requirePermission(PERMISSIONS.WARNINGS_REVOKE),
  writeRateLimit,
  validateParams(z.object({ id: uuidSchema })),
  async (req, res, next) => {
    try {
      const bodySchema = z.object({ reason: z.string().min(3).max(500) });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) throw new ApiError(400, "validation_error", "A revocation reason is required.");

      const warning = await revokeWarning({ warningId: req.params.id, reason: parsed.data.reason, actor: req.auth! });
      res.json({ warning });
    } catch (err) {
      next(err);
    }
  },
);
