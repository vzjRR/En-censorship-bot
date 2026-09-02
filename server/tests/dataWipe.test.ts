import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp, seedDefaultRoles, createStaffMember, sessionUserFor, loginAs } from "./helpers.js";

// Minimal valid PNG signature — evidence/validate.ts inspects magic bytes, not the extension/MIME type.
const FAKE_PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 0)]);

async function loginOwner(app: ReturnType<typeof buildApp>) {
  const roles = await seedDefaultRoles();
  const owner = await createStaffMember(roles.manager);
  const agent = request.agent(app);
  const csrf = await loginAs(agent, sessionUserFor(owner, "platform_owner", "Platform Owner", [], true));
  return { agent, csrf, owner };
}

describe("Owner-only data wipe", () => {
  it("rejects a non-owner, even a Manager holding every permission", async () => {
    const app = buildApp();
    const roles = await seedDefaultRoles();
    const manager = await createStaffMember(roles.manager);
    const agent = request.agent(app);
    const csrf = await loginAs(
      agent,
      sessionUserFor(manager, "manager", "Manager", [
        "settings.manage",
        "staff.manage",
        "warnings.revoke",
        "bans.revoke",
        "data.export",
      ]),
    );

    const res = await agent
      .post("/api/settings/data-wipe")
      .set("X-CSRF-Token", csrf)
      .send({ categories: ["audit_logs"], confirm: true });

    expect(res.status).toBe(403);
  });

  it("rejects wiping players or staff without also wiping warnings and bans", async () => {
    const app = buildApp();
    const { agent, csrf } = await loginOwner(app);

    const res = await agent
      .post("/api/settings/data-wipe")
      .set("X-CSRF-Token", csrf)
      .send({ categories: ["players"], confirm: true });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/warnings/i);
  });

  it("rejects a wipe without explicit confirmation", async () => {
    const app = buildApp();
    const { agent, csrf } = await loginOwner(app);

    const res = await agent
      .post("/api/settings/data-wipe")
      .set("X-CSRF-Token", csrf)
      .send({ categories: ["audit_logs"] });

    expect(res.status).toBe(400);
  });

  it("hard-deletes the selected categories and still records an audit entry for the wipe itself, even when audit_logs was wiped", async () => {
    const app = buildApp();
    const { agent, csrf, owner } = await loginOwner(app);

    const { createWarning } = await import("../src/moderation/warnings/warnings.service.js");
    const { createBan } = await import("../src/moderation/bans/bans.service.js");
    const actor = {
      discordUserId: owner.discordUserId,
      discordUsername: owner.discordUsername,
      displayName: owner.displayName,
      avatarHash: null,
      isPlatformOwner: false,
      staffId: owner.id,
      roleKey: "manager",
      roleName: "Manager",
      permissions: [],
      discordRoleIds: [],
      discordRoleName: null,
      rolesSyncedAt: new Date().toISOString(),
    };

    await createWarning({ playerName: "WipeMe", reason: "Test", durationType: "7_days", evidenceFiles: [] }, actor);
    await createBan(
      {
        playerName: "WipeMe",
        reason: "Test",
        durationType: "6_hours",
        evidenceFiles: [{ buffer: FAKE_PNG, originalname: "a.png", mimetype: "image/png", size: FAKE_PNG.length }],
      },
      actor,
    );

    const { listWarnings } = await import("../src/moderation/warnings/warnings.service.js");
    const { listBans } = await import("../src/moderation/bans/bans.service.js");
    const { db } = await import("../src/database/client.js");
    const { players } = await import("../src/database/schema/index.js");

    expect((await listWarnings({})).length).toBeGreaterThan(0);
    expect((await listBans({})).length).toBeGreaterThan(0);

    const res = await agent
      .post("/api/settings/data-wipe")
      .set("X-CSRF-Token", csrf)
      .send({ categories: ["warnings", "bans", "players", "audit_logs"], confirm: true });

    expect(res.status).toBe(200);
    expect(res.body.rowsDeleted.warnings).toBeGreaterThan(0);
    expect(res.body.rowsDeleted.bans).toBeGreaterThan(0);

    expect(await listWarnings({})).toEqual([]);
    expect(await listBans({})).toEqual([]);
    expect(await db.select().from(players)).toEqual([]);

    const { queryAuditLogs } = await import("../src/audit/audit.service.js");
    const logs = await queryAuditLogs({ action: "DATA_WIPED" });
    expect(logs.length).toBe(1);
    expect((logs[0].metadata as any).categories).toEqual(["warnings", "bans", "players", "audit_logs"]);
  });
});
