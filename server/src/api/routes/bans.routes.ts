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
import { DURATION_TYPES } from "../../moderation/duration.js";
import { createBan, revokeBan, listBans, getBanById, getBanEvidence, BanValidationError } from "../../moderation/bans/bans.service.js";
import { toCsv } from "../../utils/csv.js";

export const bansRouter = Router();

bansRouter.use(requireAuth);

const uuidSchema = z.string().uuid();

const createBanFieldsSchema = z.object({
  playerDiscordId: z
    .string()
    .regex(/^\d{15,25}$/)
    .optional()
    .or(z.literal("")),
  playerName: z.string().min(1).max(100),
  fivemIdentifier: z.string().max(100).optional().or(z.literal("")),
  reason: z.string().min(1).max(500),
  durationType: z.enum(DURATION_TYPES as unknown as [string, ...string[]]),
  customDurationHours: z.coerce.number().int().positive().optional(),
  idempotencyKey: z.string().max(200).optional(),
});

bansRouter.post(
  "/",
  verifyCsrf,
  requirePermission(PERMISSIONS.BANS_CREATE),
  writeRateLimit,
  evidenceUpload.array("evidence", 5),
  async (req, res, next) => {
    try {
      const parsed = createBanFieldsSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(400, "validation_error", parsed.error.issues.map((i) => i.message).join("; "));
      }
      const fields = parsed.data;
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];

      if (files.length === 0) {
        throw new ApiError(400, "evidence_required", "Evidence is required before issuing a ban.");
      }

      const ban = await createBan(
        {
          playerDiscordId: fields.playerDiscordId || null,
          playerName: fields.playerName,
          fivemIdentifier: fields.fivemIdentifier || null,
          reason: fields.reason,
          durationType: fields.durationType as any,
          customDurationHours: fields.customDurationHours ?? null,
          evidenceFiles: files.map((f) => ({ buffer: f.buffer, originalname: f.originalname, mimetype: f.mimetype, size: f.size })),
          idempotencyKey: fields.idempotencyKey || null,
        },
        req.auth!,
      );

      res.status(201).json({ ban });
    } catch (err) {
      if (err instanceof BanValidationError) return next(new ApiError(400, "evidence_required", err.message));
      if (err instanceof EvidenceValidationError) return next(new ApiError(400, "invalid_evidence", err.message));
      if (err instanceof EvidenceStorageError) return next(new ApiError(502, "evidence_storage_failed", err.message));
      next(err);
    }
  },
);

bansRouter.get(
  "/",
  requirePermission(PERMISSIONS.BANS_VIEW),
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
      const results = await listBans(filters);
      res.json({ bans: results });
    } catch (err) {
      next(err);
    }
  },
);

bansRouter.get("/export", requirePermission(PERMISSIONS.DATA_EXPORT), async (req, res, next) => {
  try {
    const results = await listBans({ limit: 5000 });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=bans.csv");
    res.send(toCsv(results as unknown as Record<string, unknown>[]));
  } catch (err) {
    next(err);
  }
});

bansRouter.get(
  "/:id",
  requirePermission(PERMISSIONS.BANS_VIEW),
  validateParams(z.object({ id: uuidSchema })),
  async (req, res, next) => {
    try {
      const ban = await getBanById(req.params.id);
      if (!ban) throw new ApiError(404, "not_found", "Ban not found.");
      const evidence = await getBanEvidence(ban.id);
      res.json({ ban, evidence });
    } catch (err) {
      next(err);
    }
  },
);

bansRouter.post(
  "/:id/revoke",
  verifyCsrf,
  requirePermission(PERMISSIONS.BANS_REVOKE),
  writeRateLimit,
  validateParams(z.object({ id: uuidSchema })),
  async (req, res, next) => {
    try {
      const bodySchema = z.object({ reason: z.string().min(3).max(500) });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) throw new ApiError(400, "validation_error", "A revocation reason is required.");

      const ban = await revokeBan({ banId: req.params.id, reason: parsed.data.reason, actor: req.auth! });
      res.json({ ban });
    } catch (err) {
      next(err);
    }
  },
);
