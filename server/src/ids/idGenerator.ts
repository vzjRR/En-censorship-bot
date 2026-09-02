import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { idCounters } from "../database/schema/index.js";
import { db } from "../database/client.js";
import * as schema from "../database/schema/index.js";

export type Scope = "WRN" | "BAN";

/**
 * Atomically allocates the next sequence number for (scope, year) and
 * returns a human-friendly code like WRN-2026-000123. Uses an UPSERT with
 * `counter = counter + 1 RETURNING`, which Postgres executes under a
 * row-level lock — safe under concurrent requests, including two staff
 * members issuing a warning/ban in the same millisecond.
 */
export async function generateModerationCode(
  scope: Scope,
  year: number,
  tx: NodePgDatabase<typeof schema> = db,
): Promise<string> {
  const [row] = await tx
    .insert(idCounters)
    .values({ scope, year, counter: 1 })
    .onConflictDoUpdate({
      target: [idCounters.scope, idCounters.year],
      set: { counter: sql`${idCounters.counter} + 1` },
    })
    .returning();

  const counter = row.counter.toString().padStart(6, "0");
  return `${scope}-${year}-${counter}`;
}
