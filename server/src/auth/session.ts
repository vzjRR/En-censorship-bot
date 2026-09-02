import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "../database/client.js";
import { env } from "../config/env.js";

const PgSession = connectPgSimple(session);

export const sessionMiddleware = session({
  store: new PgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true,
  }),
  name: "enclave.sid",
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    // Scope the cookie to our own mount path when deployed under a
    // sub-path (e.g. /censorship) behind a shared reverse proxy — without
    // this it defaults to "/" and would also be sent on requests to
    // unrelated apps sharing the same domain.
    path: env.BASE_PATH || "/",
    maxAge: 1000 * 60 * 60 * 12, // 12 hours
  },
});
