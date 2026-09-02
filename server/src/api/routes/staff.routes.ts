import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { verifyCsrf } from "../middleware/csrf.js";
import { validateBody, validateParams, validateQuery } from "../middleware/validate.js";
import { searchRateLimit, adminRateLimit } from "../middleware/rateLimit.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import { searchGuildMembers, fetchGuildMember } from "../../bot/services/memberService.js";
import {
  listStaffMembers,
  addStaffMember,
  updateStaffMember,
  changeStaffRole,
  removeStaffMember,
  findStaffById,
  setStaffDiscordRole,
} from "../../staff/staff.service.js";
import { listStaffRoles, createStaffRole, updateStaffRole, deleteStaffRole } from "../../staff/roles.service.js";
import { ALL_PERMISSIONS, PLATFORM_OWNER_ROLE_KEY } from "../../auth/permissions.js";
import { ApiError } from "../middleware/errorHandler.js";

export const staffRouter = Router();

staffRouter.use(requireAuth);
// CSRF protection for every mutating method on this router; verifyCsrf is a
// no-op for safe methods (GET/HEAD/OPTIONS), so read routes are unaffected.
staffRouter.use(verifyCsrf);

const discordIdSchema = z.string().regex(/^\d{15,25}$/, "Invalid Discord ID");
const uuidSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// Discord member search (for the "Add Staff" flow)
// ---------------------------------------------------------------------------
staffRouter.get(
  "/search-discord",
  requirePermission(PERMISSIONS.STAFF_MANAGE),
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

// ---------------------------------------------------------------------------
// Staff roles (configurable levels: Manager, Deputy Manager, Staff, ...)
// ---------------------------------------------------------------------------
staffRouter.get("/roles", requirePermission(PERMISSIONS.STAFF_VIEW), async (req, res, next) => {
  try {
    const roles = await listStaffRoles();
    res.json({ roles: roles.filter((r) => r.key !== PLATFORM_OWNER_ROLE_KEY) });
  } catch (err) {
    next(err);
  }
});

const roleBodySchema = z.object({
  key: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9_]+$/, "Role key must be lowercase snake_case"),
  name: z.string().min(2).max(100),
  rank: z.number().int().min(1).max(1000),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])),
  requiredDiscordRoleId: discordIdSchema.optional().nullable(),
});

staffRouter.post(
  "/roles",
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  adminRateLimit,
  validateBody(roleBodySchema),
  async (req, res, next) => {
    try {
      if (req.body.key === PLATFORM_OWNER_ROLE_KEY) {
        throw new ApiError(400, "reserved_key", "This role key is reserved.");
      }
      const role = await createStaffRole(req.body);
      res.status(201).json({ role });
    } catch (err) {
      next(err);
    }
  },
);

const roleUpdateSchema = roleBodySchema.partial().omit({ key: true });

staffRouter.patch(
  "/roles/:id",
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  adminRateLimit,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(roleUpdateSchema),
  async (req, res, next) => {
    try {
      const role = await updateStaffRole(req.params.id, req.body);
      res.json({ role });
    } catch (err) {
      next(err);
    }
  },
);

staffRouter.delete(
  "/roles/:id",
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  adminRateLimit,
  validateParams(z.object({ id: uuidSchema })),
  async (req, res, next) => {
    try {
      await deleteStaffRole(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Staff members
// ---------------------------------------------------------------------------
staffRouter.get("/", requirePermission(PERMISSIONS.STAFF_VIEW), async (req, res, next) => {
  try {
    const members = await listStaffMembers();
    res.json({ staff: members.filter((m) => m.role.key !== PLATFORM_OWNER_ROLE_KEY || m.discordUserId === req.auth?.discordUserId) });
  } catch (err) {
    next(err);
  }
});

staffRouter.get(
  "/:id",
  requirePermission(PERMISSIONS.STAFF_VIEW),
  validateParams(z.object({ id: uuidSchema })),
  async (req, res, next) => {
    try {
      const member = await findStaffById(req.params.id);
      if (!member) throw new ApiError(404, "not_found", "Staff member not found.");
      res.json({ staff: member });
    } catch (err) {
      next(err);
    }
  },
);

const addStaffSchema = z.object({
  discordUserId: discordIdSchema,
  roleId: uuidSchema,
  displayNameOverride: z.string().min(1).max(100).optional(),
  // The Discord role that represents them as staff in moderation messages —
  // distinct from roleId (the platform permission level, checked above).
  discordRoleId: discordIdSchema.optional(),
});

staffRouter.post(
  "/",
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  adminRateLimit,
  validateBody(addStaffSchema),
  async (req, res, next) => {
    try {
      // Never trust a client-supplied username/display name/role for identity
      // — resolve everything from Discord via the bot itself.
      const member = await fetchGuildMember(req.body.discordUserId);
      if (!member) {
        throw new ApiError(400, "not_a_guild_member", "This Discord user is not a member of the server.");
      }

      let discordRoleId: string | null = null;
      let discordRoleName: string | null = null;
      if (req.body.discordRoleId) {
        const matchedRole = member.roles.find((r) => r.id === req.body.discordRoleId);
        if (!matchedRole) {
          throw new ApiError(400, "invalid_discord_role", "This Discord member does not currently hold that role.");
        }
        discordRoleId = matchedRole.id;
        discordRoleName = matchedRole.name;
      }

      const created = await addStaffMember({
        discordUserId: member.id,
        discordUsername: member.username,
        displayName: req.body.displayNameOverride ?? member.displayName,
        roleId: req.body.roleId,
        discordRoleIds: member.roleIds,
        discordRoleId,
        discordRoleName,
        addedByDiscordId: req.auth!.discordUserId,
        addedByName: req.auth!.displayName,
      });
      res.status(201).json({ staff: created });
    } catch (err) {
      next(err);
    }
  },
);

staffRouter.patch(
  "/:id/discord-role",
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  adminRateLimit,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(z.object({ discordRoleId: discordIdSchema })),
  async (req, res, next) => {
    try {
      const existing = await findStaffById(req.params.id);
      if (!existing) throw new ApiError(404, "not_found", "Staff member not found.");

      const member = await fetchGuildMember(existing.discordUserId);
      if (!member) {
        throw new ApiError(400, "not_a_guild_member", "This staff member is no longer in the Discord server.");
      }
      const matchedRole = member.roles.find((r) => r.id === req.body.discordRoleId);
      if (!matchedRole) {
        throw new ApiError(400, "invalid_discord_role", "This Discord member does not currently hold that role.");
      }

      const updated = await setStaffDiscordRole(req.params.id, matchedRole.id, matchedRole.name, {
        discordId: req.auth!.discordUserId,
        name: req.auth!.displayName,
      });
      res.json({ staff: updated });
    } catch (err) {
      next(err);
    }
  },
);

const updateStaffSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

staffRouter.patch(
  "/:id",
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  adminRateLimit,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(updateStaffSchema),
  async (req, res, next) => {
    try {
      const updated = await updateStaffMember(req.params.id, req.body, {
        discordId: req.auth!.discordUserId,
        name: req.auth!.displayName,
      });
      res.json({ staff: updated });
    } catch (err) {
      next(err);
    }
  },
);

staffRouter.patch(
  "/:id/role",
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  adminRateLimit,
  validateParams(z.object({ id: uuidSchema })),
  validateBody(z.object({ roleId: uuidSchema })),
  async (req, res, next) => {
    try {
      const updated = await changeStaffRole(req.params.id, req.body.roleId, {
        discordId: req.auth!.discordUserId,
        name: req.auth!.displayName,
      });
      res.json({ staff: updated });
    } catch (err) {
      next(err);
    }
  },
);

staffRouter.delete(
  "/:id",
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  adminRateLimit,
  validateParams(z.object({ id: uuidSchema })),
  async (req, res, next) => {
    try {
      await removeStaffMember(req.params.id, { discordId: req.auth!.discordUserId, name: req.auth!.displayName });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);
