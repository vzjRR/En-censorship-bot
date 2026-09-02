import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateQuery } from "../middleware/validate.js";
import { PERMISSIONS } from "../../auth/permissions.js";
import { queryAuditLogs } from "../../audit/audit.service.js";
import { toCsv } from "../../utils/csv.js";

export const auditRouter = Router();

auditRouter.use(requireAuth);

const querySchema = z.object({
  action: z.string().optional(),
  actorDiscordId: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  format: z.enum(["json", "csv"]).optional(),
});

auditRouter.get("/", requirePermission(PERMISSIONS.AUDIT_VIEW), validateQuery(querySchema), async (req, res, next) => {
  try {
    const query = req.query as unknown as z.infer<typeof querySchema>;
    const logs = await queryAuditLogs(query);

    if (query.format === "csv") {
      if (req.auth && !req.auth.isPlatformOwner && !req.auth.permissions.includes(PERMISSIONS.DATA_EXPORT)) {
        return res.status(403).json({ error: "forbidden", message: "Missing data.export permission." });
      }
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=audit-logs.csv");
      return res.send(toCsv(logs));
    }

    res.json({ logs });
  } catch (err) {
    next(err);
  }
});
