import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import path from "node:path";
import { env } from "../config/env.js";
import { sessionMiddleware } from "../auth/session.js";
import { globalApiRateLimit } from "./middleware/rateLimit.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";

import { authRouter } from "./routes/auth.routes.js";
import { staffRouter } from "./routes/staff.routes.js";
import { sessionsRouter } from "./routes/sessions.routes.js";
import { warningsRouter } from "./routes/warnings.routes.js";
import { bansRouter } from "./routes/bans.routes.js";
import { playersRouter } from "./routes/players.routes.js";
import { searchRouter } from "./routes/search.routes.js";
import { auditRouter } from "./routes/audit.routes.js";
import { statisticsRouter } from "./routes/statistics.routes.js";
import { settingsRouter } from "./routes/settings.routes.js";
import { evidenceRouter } from "./routes/evidence.routes.js";

const WEB_DIST_DIR = path.resolve(process.cwd(), "..", "web", "dist");

export function createApp(): Express {
  const app = express();

  // Behind Cloudflare / a reverse proxy in production — needed so
  // req.ip / rate limiting see the real client IP from X-Forwarded-For.
  if (env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind's build emits a single external stylesheet; kept for safety with any future inline <style>.
          imgSrc: ["'self'", "data:", "https://cdn.discordapp.com"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          // helmet's defaults always include upgrade-insecure-requests; explicitly
          // null it out in development so http://localhost isn't rewritten to https.
          upgradeInsecureRequests: env.NODE_ENV === "production" ? [] : null,
        },
      },
    }),
  );

  if (env.NODE_ENV !== "production") {
    app.use(cors({ origin: env.APP_BASE_URL, credentials: true }));
  }

  app.use(express.json({ limit: "1mb" }));
  app.use(sessionMiddleware);
  app.use(globalApiRateLimit);

  const api = express.Router();

  // Test-only backdoor to establish a session without a real Discord OAuth
  // round-trip. Only ever mounted when NODE_ENV=test (set exclusively by
  // the vitest setup file), never reachable in a production build.
  if (env.NODE_ENV === "test") {
    api.post("/__test__/set-session", (req, res) => {
      req.session.user = req.body.user;
      req.session.csrfToken = "test-csrf-token";
      req.session.save(() => res.json({ ok: true, csrfToken: req.session.csrfToken }));
    });
  }

  api.use("/auth", authRouter);
  api.use("/staff", staffRouter);
  api.use("/staff/duty", sessionsRouter);
  api.use("/warnings", warningsRouter);
  api.use("/bans", bansRouter);
  api.use("/players", playersRouter);
  api.use("/search", searchRouter);
  api.use("/audit", auditRouter);
  api.use("/statistics", statisticsRouter);
  api.use("/settings", settingsRouter);
  api.use("/evidence", evidenceRouter);

  app.use(`${env.BASE_PATH}/api`, api);

  // Serve the built dashboard SPA (present in production/Docker images).
  app.use(env.BASE_PATH || "/", express.static(WEB_DIST_DIR));
  app.get(`${env.BASE_PATH}/*`, (req, res, next) => {
    if (req.path.startsWith(`${env.BASE_PATH}/api`)) return next();
    res.sendFile(path.join(WEB_DIST_DIR, "index.html"), (err) => {
      if (err) next();
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
