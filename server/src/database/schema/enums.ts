import { pgEnum } from "drizzle-orm/pg-core";

export const staffStatusEnum = pgEnum("staff_status", ["ACTIVE", "INACTIVE"]);

export const staffSessionStatusEnum = pgEnum("staff_session_status", ["ACTIVE", "COMPLETED"]);

export const moderationStatusEnum = pgEnum("moderation_status", ["ACTIVE", "EXPIRED", "REVOKED"]);

export const durationTypeEnum = pgEnum("duration_type", [
  "1_hour",
  "6_hours",
  "12_hours",
  "1_day",
  "3_days",
  "7_days",
  "14_days",
  "30_days",
  "PERMANENT",
  "CUSTOM",
]);

export const evidenceTypeEnum = pgEnum("evidence_type", ["IMAGE", "VIDEO"]);

export const discordLogStatusEnum = pgEnum("discord_log_status", ["PENDING", "SENT", "FAILED"]);
