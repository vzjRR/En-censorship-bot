import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { buildApp, seedDefaultRoles, createStaffMember, sessionUserFor, loginAs } from "./helpers.js";

describe("Security", () => {
  it("rejects unauthorized API calls across protected resource types", async () => {
    const app = buildApp();
    const endpoints = ["/api/staff", "/api/warnings", "/api/bans", "/api/players/search?query=x", "/api/audit", "/api/statistics/overview"];
    for (const endpoint of endpoints) {
      const res = await request(app).get(endpoint);
      expect(res.status).toBe(401);
    }
  });

  it("treats a garbage/forged session cookie as unauthenticated rather than trusting it", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/staff").set("Cookie", "enclave.sid=s%3Aforged-not-a-real-session.invalidsignature");
    expect(res.status).toBe(401);
  });

  it("never trusts a client-supplied Discord username when adding staff — identity comes from the bot lookup", async () => {
    vi.resetModules();
    vi.doMock("../src/bot/services/memberService.js", () => ({
      fetchGuildMember: vi.fn(async (id: string) => ({
        id,
        username: "real_bot_resolved_name",
        displayName: "Real Resolved Name",
        avatarUrl: null,
        roleIds: [],
      })),
      searchGuildMembers: vi.fn(async () => []),
    }));

    const { createApp } = await import("../src/api/app.js");
    const app = createApp();
    const roles = await seedDefaultRoles();
    const manager = await createStaffMember(roles.manager);
    const agent = request.agent(app);
    const csrf = await loginAs(agent, sessionUserFor(manager, "manager", "Manager", ["staff.view", "staff.manage"]));

    const res = await agent
      .post("/api/staff")
      .set("X-CSRF-Token", csrf)
      // discordUsername is not even part of the accepted schema — an
      // attacker cannot smuggle a spoofed identity through it.
      .send({ discordUserId: "900000000000000555", roleId: roles.staff, discordUsername: "SpoofedAdminName" });

    expect(res.status).toBe(201);
    expect(res.body.staff.discordUsername).toBe("real_bot_resolved_name");
    expect(res.body.staff.discordUsername).not.toBe("SpoofedAdminName");

    vi.doUnmock("../src/bot/services/memberService.js");
    vi.resetModules();
  });

  it("does not let a Staff-permission session escalate into Manager-only operations by forging permissions client-side", async () => {
    const app = buildApp();
    const roles = await seedDefaultRoles();
    const staff = await createStaffMember(roles.staff);
    const agent = request.agent(app);
    // Attempt to log in with a forged, over-privileged permission set.
    await loginAs(agent, sessionUserFor(staff, "staff", "Staff", ["staff.manage", "settings.manage"]));

    // requireAuth re-derives permissions from the database on every request,
    // discarding whatever the (forged) session claimed.
    const res = await agent.get("/api/settings");
    expect(res.status).toBe(403);
  });

  it("validates the OAuth2 state parameter and rejects a mismatched callback", async () => {
    const app = buildApp();
    const agent = request.agent(app);
    // No prior /discord/login call means no oauthState was ever stored.
    const res = await agent.get("/api/auth/discord/callback?code=abc&state=whatever");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("authError=invalid_state");
  });

  // Runs last: it shares the /api/auth/discord/* login rate limiter with the
  // test above, and express-rate-limit's in-memory store persists for the
  // life of the process, so this must not run before other auth tests.
  it("enforces rate limiting on the login endpoint", async () => {
    const app = buildApp();
    let sawRateLimited = false;
    for (let i = 0; i < 25; i++) {
      const res = await request(app).get("/api/auth/discord/login");
      if (res.status === 429) {
        sawRateLimited = true;
        break;
      }
    }
    expect(sawRateLimited).toBe(true);
  });
});
