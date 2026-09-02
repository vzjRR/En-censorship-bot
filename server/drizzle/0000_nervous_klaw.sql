CREATE TYPE "public"."discord_log_status" AS ENUM('PENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."duration_type" AS ENUM('1_hour', '6_hours', '12_hours', '1_day', '3_days', '7_days', '14_days', '30_days', 'PERMANENT', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('IMAGE', 'VIDEO');--> statement-breakpoint
CREATE TYPE "public"."moderation_status" AS ENUM('ACTIVE', 'EXPIRED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."staff_session_status" AS ENUM('ACTIVE', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."staff_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"discord_user_id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"global_name" text,
	"avatar_hash" text,
	"first_login_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_ip" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"rank" integer NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_discord_role_id" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_user_id" text NOT NULL,
	"discord_username" text NOT NULL,
	"display_name" text NOT NULL,
	"role_id" uuid NOT NULL,
	"discord_role_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "staff_status" DEFAULT 'ACTIVE' NOT NULL,
	"added_by_discord_id" text NOT NULL,
	"last_role_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_members_discord_user_id_unique" UNIQUE("discord_user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"staff_user_id" text NOT NULL,
	"staff_name" text NOT NULL,
	"staff_role" text NOT NULL,
	"login_time" timestamp with time zone DEFAULT now() NOT NULL,
	"logout_time" timestamp with time zone,
	"notes" text,
	"status" "staff_session_status" DEFAULT 'ACTIVE' NOT NULL,
	"login_message_id" text,
	"logout_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_user_id" text,
	"discord_username" text,
	"fivem_identifier" text,
	"player_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "warning_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"warning_id" uuid NOT NULL,
	"attachment_id" text,
	"attachment_url" text NOT NULL,
	"attachment_type" "evidence_type" NOT NULL,
	"filename" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "warnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"warning_code" text NOT NULL,
	"player_id" uuid NOT NULL,
	"warning_number" integer NOT NULL,
	"reason" text NOT NULL,
	"duration_type" "duration_type" NOT NULL,
	"duration_hours" integer,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"status" "moderation_status" DEFAULT 'ACTIVE' NOT NULL,
	"issued_by_staff_id" uuid NOT NULL,
	"issued_by_name" text NOT NULL,
	"revoked_by_staff_id" uuid,
	"revoked_reason" text,
	"revoked_at" timestamp with time zone,
	"discord_message_id" text,
	"discord_log_status" "discord_log_status" DEFAULT 'PENDING' NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warnings_warning_code_unique" UNIQUE("warning_code"),
	CONSTRAINT "warnings_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ban_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ban_id" uuid NOT NULL,
	"attachment_id" text,
	"attachment_url" text NOT NULL,
	"attachment_type" "evidence_type" NOT NULL,
	"filename" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ban_code" text NOT NULL,
	"player_id" uuid NOT NULL,
	"fivem_identifier" text,
	"discord_user_id" text,
	"player_name" text NOT NULL,
	"reason" text NOT NULL,
	"duration_type" "duration_type" NOT NULL,
	"duration_hours" integer,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"status" "moderation_status" DEFAULT 'ACTIVE' NOT NULL,
	"issued_by_staff_id" uuid NOT NULL,
	"issued_by_name" text NOT NULL,
	"revoked_by_staff_id" uuid,
	"revoked_reason" text,
	"revoked_at" timestamp with time zone,
	"discord_message_id" text,
	"discord_log_status" "discord_log_status" DEFAULT 'PENDING' NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bans_ban_code_unique" UNIQUE("ban_code"),
	CONSTRAINT "bans_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_discord_id" text,
	"actor_name" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "id_counters" (
	"scope" text NOT NULL,
	"year" integer NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "id_counters_scope_year_pk" PRIMARY KEY("scope","year")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_role_id_staff_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."staff_roles"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staff_id_staff_members_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warning_evidence" ADD CONSTRAINT "warning_evidence_warning_id_warnings_id_fk" FOREIGN KEY ("warning_id") REFERENCES "public"."warnings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warnings" ADD CONSTRAINT "warnings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warnings" ADD CONSTRAINT "warnings_issued_by_staff_id_staff_members_id_fk" FOREIGN KEY ("issued_by_staff_id") REFERENCES "public"."staff_members"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warnings" ADD CONSTRAINT "warnings_revoked_by_staff_id_staff_members_id_fk" FOREIGN KEY ("revoked_by_staff_id") REFERENCES "public"."staff_members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ban_evidence" ADD CONSTRAINT "ban_evidence_ban_id_bans_id_fk" FOREIGN KEY ("ban_id") REFERENCES "public"."bans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bans" ADD CONSTRAINT "bans_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bans" ADD CONSTRAINT "bans_issued_by_staff_id_staff_members_id_fk" FOREIGN KEY ("issued_by_staff_id") REFERENCES "public"."staff_members"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bans" ADD CONSTRAINT "bans_revoked_by_staff_id_staff_members_id_fk" FOREIGN KEY ("revoked_by_staff_id") REFERENCES "public"."staff_members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_username_idx" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_members_discord_user_id_idx" ON "staff_members" USING btree ("discord_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_members_status_idx" ON "staff_members" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_sessions_staff_id_idx" ON "staff_sessions" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_sessions_status_idx" ON "staff_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_sessions_staff_user_id_idx" ON "staff_sessions" USING btree ("staff_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_discord_user_id_idx" ON "players" USING btree ("discord_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_fivem_identifier_idx" ON "players" USING btree ("fivem_identifier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_player_name_idx" ON "players" USING btree ("player_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warning_evidence_warning_id_idx" ON "warning_evidence" USING btree ("warning_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warnings_player_id_idx" ON "warnings" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warnings_status_idx" ON "warnings" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warnings_expires_at_idx" ON "warnings" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warnings_created_at_idx" ON "warnings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ban_evidence_ban_id_idx" ON "ban_evidence" USING btree ("ban_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bans_player_id_idx" ON "bans" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bans_status_idx" ON "bans" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bans_expires_at_idx" ON "bans" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bans_created_at_idx" ON "bans" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_actor_discord_id_idx" ON "audit_logs" USING btree ("actor_discord_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");