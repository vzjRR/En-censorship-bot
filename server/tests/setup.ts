import { beforeAll, afterAll, afterEach } from "vitest";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://enclave:enclave_dev_password@localhost:5432/enclave_rp_test";
process.env.SESSION_SECRET = "test_session_secret_at_least_16_characters_long";
process.env.DISCORD_BOT_TOKEN = "test_bot_token_placeholder";
process.env.DISCORD_CLIENT_ID = "1544434302308319293";
process.env.DISCORD_CLIENT_SECRET = "test_client_secret_placeholder";
process.env.DISCORD_GUILD_ID = "1000000000000000000";
process.env.PLATFORM_OWNER_ID = "1303195553068482591";
process.env.BOT_ID = "1544434302308319293";
process.env.STAFF_LOG_CHANNEL_ID = "1539101062152069202";
process.env.WARNING_CHANNEL_ID = "1539103436308611082";
process.env.BAN_CHANNEL_ID = "1539102903745249372";
process.env.TIMEZONE = "Asia/Muscat";
process.env.EXPIRATION_WORKER_INTERVAL_MS = "60000";
process.env.EVIDENCE_STORAGE_DRIVER = "local";
process.env.MAX_EVIDENCE_FILE_SIZE_MB = "25";
process.env.APP_BASE_URL = "http://localhost:3000";
process.env.BASE_PATH = "";

const TABLES = [
  "audit_logs",
  "ban_evidence",
  "bans",
  "warning_evidence",
  "warnings",
  "staff_sessions",
  "players",
  "staff_members",
  "staff_roles",
  "id_counters",
  "system_settings",
  "users",
];

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { db } = await import("../src/database/client.js");
  await migrate(db, { migrationsFolder: "./drizzle" });
});

afterEach(async () => {
  const { pool } = await import("../src/database/client.js");
  await pool.query(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  const { closeDatabase } = await import("../src/database/client.js");
  await closeDatabase();
});
