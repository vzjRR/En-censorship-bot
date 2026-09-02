import { eq } from "drizzle-orm";
import { db } from "../database/client.js";
import { systemSettings } from "../database/schema/index.js";

export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const row = await db.query.systemSettings.findFirst({ where: eq(systemSettings.key, key) });
  return row?.value as T | undefined;
}

export async function listSettings() {
  return db.select().from(systemSettings);
}

export async function setSetting(key: string, value: unknown, updatedBy: string): Promise<void> {
  await db
    .insert(systemSettings)
    .values({ key, value, updatedBy })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, updatedBy, updatedAt: new Date() },
    });
}
