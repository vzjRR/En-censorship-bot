import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, closeDatabase } from "./client.js";

async function main() {
  console.log("[migrate] applying pending migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] done.");
  await closeDatabase();
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
