import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { buildApp, seedDefaultRoles, createStaffMember, sessionUserFor, loginAs, putOnDuty } from "./helpers.js";

describe("Revoke notifications config (Settings → Messages)", () => {
  it("requires messages.manage to view or edit, and persists the toggle", async () => {
    const app = buildApp();
    const roles = await seedDefaultRoles();
    const staff = await createStaffMember(roles.staff);
    const manager = await createStaffMember(roles.manager);

    const staffAgent = request.agent(app);
    await loginAs(staffAgent, sessionUserFor(staff, "staff", "Staff", ["dashboard.view"]));
    const forbidden = await staffAgent.get("/api/settings/revoke-notifications");
    expect(forbidden.status).toBe(403);

    const agent = request.agent(app);
    const csrf = await loginAs(agent, sessionUserFor(manager, "manager", "Manager", ["messages.manage"]));

    const before = await agent.get("/api/settings/revoke-notifications").expect(200);
    expect(before.body.config).toEqual({ warningEnabled: true, banEnabled: true });

    await agent
      .put("/api/settings/revoke-notifications")
      .set("X-CSRF-Token", csrf)
      .send({ warningEnabled: false, banEnabled: true })
      .expect(200);

    const after = await agent.get("/api/settings/revoke-notifications").expect(200);
    expect(after.body.config).toEqual({ warningEnabled: false, banEnabled: true });
  });
});

describe("Revoke notifications actually gate the Discord send", () => {
  it("skips the Discord message on warning revoke when disabled, and sends it when enabled", async () => {
    vi.resetModules();
    const sent: string[] = [];

    vi.doMock("../src/bot/services/logService.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/bot/services/logService.js")>();
      return {
        ...actual,
        sendChannelMessage: vi.fn(async (channelId: string, content: string) => {
          sent.push(content);
          return { status: "SENT", messageId: "fake" };
        }),
      };
    });

    const { setRevokeNotificationsConfig } = await import("../src/settings/revokeNotifications.service.js");
    await setRevokeNotificationsConfig({ warningEnabled: false, banEnabled: true }, "tester");

    const roles = await seedDefaultRoles();
    const staff = await createStaffMember(roles.staff);
    await putOnDuty(staff);
    const { createWarning, revokeWarning } = await import("../src/moderation/warnings/warnings.service.js");

    const actor = {
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
    };

    const warning = await createWarning(
      { playerName: "NotifyTest", reason: "Test", durationType: "7_days", evidenceFiles: [] },
      actor,
    );
    sent.length = 0; // ignore the creation-time send attempt

    await revokeWarning({ warningId: warning.id, reason: "Issued in error", actor });
    expect(sent).toEqual([]); // disabled — no revoke notification sent

    await setRevokeNotificationsConfig({ warningEnabled: true, banEnabled: true }, "tester");
    const warning2 = await createWarning(
      { playerName: "NotifyTest2", reason: "Test", durationType: "7_days", evidenceFiles: [] },
      actor,
    );
    sent.length = 0;
    await revokeWarning({ warningId: warning2.id, reason: "Issued in error", actor });
    expect(sent.length).toBe(1); // enabled — revoke notification sent

    vi.doUnmock("../src/bot/services/logService.js");
    vi.resetModules();
  });
});
