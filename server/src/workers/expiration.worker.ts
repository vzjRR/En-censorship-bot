import { env } from "../config/env.js";
import { expireOverdueWarnings } from "../moderation/warnings/warnings.service.js";
import { expireOverdueBans } from "../moderation/bans/bans.service.js";

let timer: NodeJS.Timeout | null = null;

/**
 * Sweeps ACTIVE warnings/bans whose expires_at has passed and flips them to
 * EXPIRED. This is entirely database-driven (no setTimeout-per-record), so
 * it naturally recovers state after a process restart: anything that should
 * have expired while the server was down is caught on the very next tick.
 */
export async function runExpirationSweep(): Promise<{ warnings: number; bans: number }> {
  try {
    const [expiredWarnings, expiredBans] = await Promise.all([expireOverdueWarnings(), expireOverdueBans()]);
    if (expiredWarnings.length || expiredBans.length) {
      console.log(`[expiration-worker] expired ${expiredWarnings.length} warning(s), ${expiredBans.length} ban(s).`);
    }
    return { warnings: expiredWarnings.length, bans: expiredBans.length };
  } catch (err) {
    console.error("[expiration-worker] sweep failed:", err);
    return { warnings: 0, bans: 0 };
  }
}

export function startExpirationWorker(): void {
  if (timer) return;
  // Run immediately on boot to catch anything overdue from before a restart,
  // then on a fixed interval thereafter.
  void runExpirationSweep();
  timer = setInterval(() => void runExpirationSweep(), env.EXPIRATION_WORKER_INTERVAL_MS);
  timer.unref?.();
}

export function stopExpirationWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
