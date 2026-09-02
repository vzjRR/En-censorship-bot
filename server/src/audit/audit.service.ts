import { desc, eq, and, gte, lte, type SQL } from "drizzle-orm";
import { db } from "../database/client.js";
import { auditLogs, type AuditLog } from "../database/schema/index.js";

export const AUDIT_ACTIONS = {
  STAFF_ADDED: "STAFF_ADDED",
  STAFF_REMOVED: "STAFF_REMOVED",
  STAFF_ROLE_CHANGED: "STAFF_ROLE_CHANGED",
  STAFF_UPDATED: "STAFF_UPDATED",
  STAFF_LOGIN: "STAFF_LOGIN",
  STAFF_LOGOUT: "STAFF_LOGOUT",
  WARNING_CREATED: "WARNING_CREATED",
  WARNING_EXPIRED: "WARNING_EXPIRED",
  WARNING_REVOKED: "WARNING_REVOKED",
  BAN_CREATED: "BAN_CREATED",
  BAN_EXPIRED: "BAN_EXPIRED",
  BAN_REVOKED: "BAN_REVOKED",
  ROLE_CONFIG_CREATED: "ROLE_CONFIG_CREATED",
  ROLE_CONFIG_UPDATED: "ROLE_CONFIG_UPDATED",
  ROLE_CONFIG_DELETED: "ROLE_CONFIG_DELETED",
  SETTINGS_UPDATED: "SETTINGS_UPDATED",
  MESSAGE_TEMPLATE_UPDATED: "MESSAGE_TEMPLATE_UPDATED",
  CHANNEL_ROUTING_UPDATED: "CHANNEL_ROUTING_UPDATED",
  TEST_MODE_ENABLED: "TEST_MODE_ENABLED",
  TEST_MODE_DISABLED: "TEST_MODE_DISABLED",
  ACCESS_DENIED: "ACCESS_DENIED",
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  DATA_WIPED: "DATA_WIPED",
  PUNISHMENT_ROLE_GRANT_FAILED: "PUNISHMENT_ROLE_GRANT_FAILED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface RecordAuditLogInput {
  actorDiscordId?: string | null;
  actorName?: string | null;
  action: AuditAction | string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

export async function recordAuditLog(input: RecordAuditLogInput): Promise<void> {
  await db.insert(auditLogs).values({
    actorDiscordId: input.actorDiscordId ?? null,
    actorName: input.actorName ?? null,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? {},
    ipAddress: input.ipAddress ?? null,
  });
}

export interface AuditLogQuery {
  action?: string;
  actorDiscordId?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export async function queryAuditLogs(query: AuditLogQuery): Promise<AuditLog[]> {
  const conditions: SQL[] = [];
  if (query.action) conditions.push(eq(auditLogs.action, query.action));
  if (query.actorDiscordId) conditions.push(eq(auditLogs.actorDiscordId, query.actorDiscordId));
  if (query.targetType) conditions.push(eq(auditLogs.targetType, query.targetType));
  if (query.targetId) conditions.push(eq(auditLogs.targetId, query.targetId));
  if (query.from) conditions.push(gte(auditLogs.createdAt, query.from));
  if (query.to) conditions.push(lte(auditLogs.createdAt, query.to));

  return db
    .select()
    .from(auditLogs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(query.limit ?? 100)
    .offset(query.offset ?? 0);
}
