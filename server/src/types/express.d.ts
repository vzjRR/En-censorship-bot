import type { AuthenticatedSessionUser } from "./session.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedSessionUser;
    }
  }
}

export {};
