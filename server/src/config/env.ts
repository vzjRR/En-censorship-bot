import "dotenv/config";
import { z } from "zod";

const discordSnowflake = z
  .string()
  .regex(/^\d{15,25}$/, "Expected a Discord snowflake ID");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  /**
   * Mount path when the dashboard is served from a sub-path behind a reverse
   * proxy (e.g. https://enclaverp.cc/censorship on Cloudflare). Leave empty
   * to serve from the domain root. Must start with "/" and have no
   * trailing slash, e.g. "/censorship".
   */
  BASE_PATH: z
    .string()
    .default("")
    .transform((v) => v.replace(/\/+$/, ""))
    .refine((v) => v === "" || v.startsWith("/"), "BASE_PATH must start with '/' (or be empty)"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),

  DISCORD_BOT_TOKEN: z.string().min(1, "DISCORD_BOT_TOKEN is required"),
  DISCORD_CLIENT_ID: discordSnowflake,
  DISCORD_CLIENT_SECRET: z.string().min(1, "DISCORD_CLIENT_SECRET is required"),
  DISCORD_GUILD_ID: discordSnowflake,

  PLATFORM_OWNER_ID: discordSnowflake,
  BOT_ID: discordSnowflake,
  STAFF_LOG_CHANNEL_ID: discordSnowflake,
  WARNING_CHANNEL_ID: discordSnowflake,
  BAN_CHANNEL_ID: discordSnowflake,

  TIMEZONE: z.string().default("Asia/Muscat"),

  EXPIRATION_WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),

  EVIDENCE_STORAGE_DRIVER: z.enum(["discord", "local"]).default("discord"),
  MAX_EVIDENCE_FILE_SIZE_MB: z.coerce.number().int().positive().default(25),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  // Tests provide their own minimal env; skip strict parsing failures from
  // crashing the whole process there and let vitest setup handle defaults.
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:");
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    throw new Error("Environment validation failed. See errors above and check your .env file.");
  }
  return parsed.data;
}

export const env = loadEnv();
