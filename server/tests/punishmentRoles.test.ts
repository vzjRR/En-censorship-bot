import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { buildApp, seedDefaultRoles, createStaffMember, sessionUserFor, loginAs, nextDiscordId, putOnDuty } from "./helpers.js";

describe("Punishment roles config (Settings → owner only)", () => {
  it("rejects a non-owner, even a Manager holding settings.manage", async () => {
    const app = buildApp();
    const roles = await seedDefaultRoles();
    const manager = await createStaffMember(roles.manager);
    const agent = request.agent(app);
    const csrf = await loginAs(agent, sessionUserFor(manager, "manager", "Manager", ["settings.manage"]));

    const getRes = await agent.get("/api/settings/punishment-roles");
    expect(getRes.status).toBe(403);

    const putRes = await agent
      .put("/api/settings/punishment-roles")
      .set("X-CSRF-Token", csrf)
      .send({ warningRoles: [], banRole: null });
    expect(putRes.status).toBe(403);
  });

  it("lets the owner save a config and rejects duplicate warning numbers", async () => {
    const app = buildApp();
    const roles = await seedDefaultRoles();
    const owner = await createStaffMember(roles.manager);
    const agent = request.agent(app);
    const csrf = await loginAs(agent, sessionUserFor(owner, "platform_owner", "Platform Owner", [], true));

    const dup = await agent
      .put("/api/settings/punishment-roles")
      .set("X-CSRF-Token", csrf)
      .send({
        warningRoles: [
          { warningNumber: 1, discordRoleId: "111111111111111111", discordRoleName: "Warning 1" },
          { warningNumber: 1, discordRoleId: "222222222222222222", discordRoleName: "Warning 1 dup" },
        ],
        banRole: null,
      });
    expect(dup.status).toBe(400);

    const ok = await agent
      .put("/api/settings/punishment-roles")
      .set("X-CSRF-Token", csrf)
      .send({
        warningRoles: [{ warningNumber: 1, discordRoleId: "111111111111111111", discordRoleName: "Warning 1" }],
        banRole: { discordRoleId: "333333333333333333", discordRoleName: "Banned" },
      });
    expect(ok.status).toBe(200);

    const get = await agent.get("/api/settings/punishment-roles").expect(200);
    expect(get.body.config.warningRoles).toEqual([{ warningNumber: 1, discordRoleId: "111111111111111111", discordRoleName: "Warning 1" }]);
    expect(get.body.config.banRole).toEqual({ discordRoleId: "333333333333333333", discordRoleName: "Banned" });
  });
});

describe("Punishment role grant/revoke on warnings and bans", () => {
  it("grants the configured role on warning creation and removes it on revoke", async () => {
    vi.resetModules();
    const granted: Array<{ discordUserId: string; roleId: string }> = [];
    const revoked: Array<{ discordUserId: string; roleId: string }> = [];

    vi.doMock("../src/bot/services/memberService.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/bot/services/memberService.js")>();
      return {
        ...actual,
        grantMemberRole: vi.fn(async (discordUserId: string, roleId: string) => {
          granted.push({ discordUserId, roleId });
          return { ok: true };
        }),
        revokeMemberRole: vi.fn(async (discordUserId: string, roleId: string) => {
          revoked.push({ discordUserId, roleId });
          return { ok: true };
        }),
      };
    });

    const { setPunishmentRolesConfig } = await import("../src/settings/punishmentRoles.service.js");
    await setPunishmentRolesConfig(
      { warningRoles: [{ warningNumber: 1, discordRoleId: "999888777666555444", discordRoleName: "Warning 1" }], banRole: null },
      "tester",
    );

    const roles = await seedDefaultRoles();
    const staff = await createStaffMember(roles.staff);
    await putOnDuty(staff);
    const { createWarning, revokeWarning } = await import("../src/moderation/warnings/warnings.service.js");
    const discordUserId = nextDiscordId();

    const warning = await createWarning(
      { playerDiscordId: discordUserId, playerName: "RolePlayer", reason: "Test", durationType: "7_days", evidenceFiles: [] },
      {
        discordUserId: staff.discordUserId,
        discordUsername: staff.discordUsername,
        displayName: staff.displayName,
        avatarHash: null,
        isPlatformOwner: false,
        staffId: staff.id,
        roleKey: "staff",
        roleName: "Staff",
        permissions: [],
        discordRoleIds: [],
        discordRoleName: null,
        discordRoleId: null,
        rolesSyncedAt: new Date().toISOString(),
      },
    );

    expect(warning.warningNumber).toBe(1);
    expect(warning.punishmentRoleId).toBe("999888777666555444");
    expect(granted).toEqual([{ discordUserId, roleId: "999888777666555444" }]);

    await revokeWarning({
      warningId: warning.id,
      reason: "oops",
      actor: { discordUserId: staff.discordUserId, displayName: staff.displayName, staffId: staff.id, roleName: "Staff", discordRoleName: null },
    });
    expect(revoked).toEqual([{ discordUserId, roleId: "999888777666555444" }]);

    vi.doUnmock("../src/bot/services/memberService.js");
    vi.resetModules();
  });

  it("records an audit log entry (not just a silent failure) when the Discord role grant fails", async () => {
    vi.resetModules();

    vi.doMock("../src/bot/services/memberService.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/bot/services/memberService.js")>();
      return {
        ...actual,
        grantMemberRole: vi.fn(async () => ({ ok: false, error: "Missing Permissions" })),
      };
    });

    const { setPunishmentRolesConfig } = await import("../src/settings/punishmentRoles.service.js");
    await setPunishmentRolesConfig(
      { warningRoles: [{ warningNumber: 1, discordRoleId: "999888777666555444", discordRoleName: "Warning 1" }], banRole: null },
      "tester",
    );

    const roles = await seedDefaultRoles();
    const staff = await createStaffMember(roles.staff);
    await putOnDuty(staff);
    const { createWarning } = await import("../src/moderation/warnings/warnings.service.js");
    const discordUserId = nextDiscordId();

    const warning = await createWarning(
      { playerDiscordId: discordUserId, playerName: "GrantFailPlayer", reason: "Test", durationType: "7_days", evidenceFiles: [] },
      {
        discordUserId: staff.discordUserId,
        discordUsername: staff.discordUsername,
        displayName: staff.displayName,
        avatarHash: null,
        isPlatformOwner: false,
        staffId: staff.id,
        roleKey: "staff",
        roleName: "Staff",
        permissions: [],
        discordRoleIds: [],
        discordRoleName: null,
        discordRoleId: null,
        rolesSyncedAt: new Date().toISOString(),
      },
    );

    expect(warning.punishmentRoleId).toBeNull();

    const { queryAuditLogs } = await import("../src/audit/audit.service.js");
    const logs = await queryAuditLogs({ action: "PUNISHMENT_ROLE_GRANT_FAILED", targetId: warning.id });
    expect(logs.length).toBe(1);
    expect((logs[0].metadata as any).error).toBe("Missing Permissions");
    expect((logs[0].metadata as any).discordRoleId).toBe("999888777666555444");

    vi.doUnmock("../src/bot/services/memberService.js");
    vi.resetModules();
  });

  it("grants the configured ban role and removes it when the ban expires", async () => {
    vi.resetModules();
    const granted: Array<{ discordUserId: string; roleId: string }> = [];
    const revoked: Array<{ discordUserId: string; roleId: string }> = [];

    vi.doMock("../src/bot/services/memberService.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/bot/services/memberService.js")>();
      return {
        ...actual,
        grantMemberRole: vi.fn(async (discordUserId: string, roleId: string) => {
          granted.push({ discordUserId, roleId });
          return { ok: true };
        }),
        revokeMemberRole: vi.fn(async (discordUserId: string, roleId: string) => {
          revoked.push({ discordUserId, roleId });
          return { ok: true };
        }),
      };
    });

    const { setPunishmentRolesConfig } = await import("../src/settings/punishmentRoles.service.js");
    await setPunishmentRolesConfig(
      { warningRoles: [], banRole: { discordRoleId: "111222333444555666", discordRoleName: "Banned" } },
      "tester",
    );

    const roles = await seedDefaultRoles();
    const staff = await createStaffMember(roles.staff);
    await putOnDuty(staff);
    const { createBan, expireOverdueBans } = await import("../src/moderation/bans/bans.service.js");
    const { db } = await import("../src/database/client.js");
    const { bans } = await import("../src/database/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const discordUserId = nextDiscordId();

    const FAKE_PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 0)]);

    const ban = await createBan(
      {
        playerDiscordId: discordUserId,
        playerName: "RoleBanPlayer",
        reason: "Test",
        durationType: "1_hour",
        evidenceFiles: [{ buffer: FAKE_PNG, originalname: "a.png", mimetype: "image/png", size: FAKE_PNG.length }],
      },
      {
        discordUserId: staff.discordUserId,
        discordUsername: staff.discordUsername,
        displayName: staff.displayName,
        avatarHash: null,
        isPlatformOwner: false,
        staffId: staff.id,
        roleKey: "staff",
        roleName: "Staff",
        permissions: [],
        discordRoleIds: [],
        discordRoleName: null,
        discordRoleId: null,
        rolesSyncedAt: new Date().toISOString(),
      },
    );

    expect(ban.punishmentRoleId).toBe("111222333444555666");
    expect(granted).toEqual([{ discordUserId, roleId: "111222333444555666" }]);

    await db.update(bans).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(bans.id, ban.id));
    const expired = await expireOverdueBans();
    expect(expired.some((b) => b.id === ban.id)).toBe(true);
    expect(revoked).toEqual([{ discordUserId, roleId: "111222333444555666" }]);

    vi.doUnmock("../src/bot/services/memberService.js");
    vi.resetModules();
  });
});
