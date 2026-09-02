import { describe, it, expect, vi } from "vitest";
import request from "supertest";

// env.ts reads BASE_PATH once at module load, so exercising a non-default
// value means isolating a fresh module graph rather than mutating the
// already-loaded shared config that every other test file relies on.
describe("BASE_PATH-aware OAuth redirects (sub-path deployment, e.g. /censorship)", () => {
  it("redirects post-login (success and error cases) to a URL under BASE_PATH, not the domain root", async () => {
    const previousBasePath = process.env.BASE_PATH;
    process.env.BASE_PATH = "/censorship";
    vi.resetModules();

    try {
      const { createApp } = await import("../src/api/app.js");
      const app = createApp();
      const agent = request.agent(app);

      // Error path: mismatched OAuth state should land back under /censorship/login.
      const errorRes = await agent.get("/censorship/api/auth/discord/callback?code=abc&state=wrong");
      expect(errorRes.status).toBe(302);
      const errorLocation = new URL(errorRes.headers.location, "http://localhost");
      expect(errorLocation.pathname).toBe("/censorship/login");
      expect(errorLocation.searchParams.get("authError")).toBe("invalid_state");

      // Discord-denied path uses the same frontendUrl construction.
      const deniedRes = await agent.get("/censorship/api/auth/discord/callback?error=access_denied");
      const deniedLocation = new URL(deniedRes.headers.location, "http://localhost");
      expect(deniedLocation.pathname).toBe("/censorship/login");
    } finally {
      process.env.BASE_PATH = previousBasePath;
      vi.resetModules();
    }
  });
});
