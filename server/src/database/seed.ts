import { eq } from "drizzle-orm";
import { db, closeDatabase } from "./client.js";
import { staffRoles } from "./schema/index.js";
import { DEFAULT_ROLE_SEEDS } from "../auth/permissions.js";

async function main() {
  console.log("[seed] ensuring default staff roles exist...");

  for (const seed of DEFAULT_ROLE_SEEDS) {
    const existing = await db.query.staffRoles.findFirst({ where: eq(staffRoles.key, seed.key) });
    if (existing) {
      console.log(`[seed] role "${seed.key}" already exists, skipping.`);
      continue;
    }
    await db.insert(staffRoles).values({
      key: seed.key,
      name: seed.name,
      rank: seed.rank,
      permissions: seed.permissions,
      isSystem: seed.isSystem,
    });
    console.log(`[seed] created role "${seed.key}".`);
  }

  console.log("[seed] done.");
  await closeDatabase();
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
