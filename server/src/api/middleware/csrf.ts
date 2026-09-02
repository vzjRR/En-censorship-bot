import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_HEADER = "x-csrf-token";

export function ensureCsrfToken(req: Request): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomBytes(24).toString("hex");
  }
  return req.session.csrfToken;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Synchronizer-token CSRF protection. The token is minted server-side into
 * the session and handed to the SPA only via a JSON response body (never a
 * readable cookie), then echoed back as a header on every mutating request.
 * Combined with SameSite=Lax session cookies this closes both cross-site
 * form submission and XHR-based CSRF vectors.
 */
export function verifyCsrf(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();

  const expected = req.session.csrfToken;
  const provided = req.header(CSRF_HEADER);

  if (!expected || !provided || !safeEqual(expected, provided)) {
    return res.status(403).json({ error: "csrf_invalid", message: "Missing or invalid CSRF token." });
  }

  next();
}
