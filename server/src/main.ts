import { env } from "./config/env.js";
import { createApp } from "./api/app.js";
import { startBot } from "./bot/client.js";
import { startExpirationWorker, stopExpirationWorker } from "./workers/expiration.worker.js";
import { closeDatabase } from "./database/client.js";

async function main() {
  try {
    await startBot();
  } catch (err) {
    console.error("[main] Discord bot failed to start — moderation logging will be degraded until it reconnects:", err);
  }

  startExpirationWorker();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`[main] ENCLAVE RP moderation platform listening on port ${env.PORT} (base path: "${env.BASE_PATH || "/"}")`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[main] received ${signal}, shutting down gracefully...`);
    stopExpirationWorker();
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[main] fatal startup error:", err);
  process.exit(1);
});
