import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { buildApp, seedDefaultRoles, createStaffMember, sessionUserFor, loginAs, nextDiscordId } from "./helpers.js";

describe("Staff management", () => {
  it("prevents a duplicate staff member for the same Discord ID", async () => {
    const roles = await seedDefaultRoles();
    const discordUserId = nextDiscordId();
    await createStaffMember(roles.staff, { discordUserId });

    const { addStaffMember } = await import("../src/staff/staff.service.js");
    await expect(
      addStaffMember({
        discordUserId,
        discordUsername: "dup",
        displayName: "Dup",
        roleId: roles.staff,
        discordRoleIds: [],
        addedByDiscordId: "1",
        addedByName: "Tester",
      }),
    ).rejects.toThrow(/already a staff member/i);
  });

  it("lets a manager change a staff member's role and records an audit log", async () => {
    const app = buildApp();
    const roles = await seedDefaultRoles();
    const manager = await createStaffMember(roles.manager);
    const target = await createStaffMember(roles.staff);

    const agent = request.agent(app);
    const csrf = await loginAs(agent, sessionUserFor(manager, "manager", "Manager", ["staff.view", "staff.manage"]));

    const res = await agent
      .patch(`/api/staff/${target.id}/role`)
      .set("X-CSRF-Token", csrf)
      .send({ roleId: roles.deputy_manager });

    expect(res.status).toBe(200);
    expect(res.body.staff.role.key).toBe("deputy_manager");

    const { queryAuditLogs } = await import("../src/audit/audit.service.js");
    const logs = await queryAuditLogs({ action: "STAFF_ROLE_CHANGED", targetId: target.id });
    expect(logs.length).toBe(1);
  });

  it("rejects a mutating staff request without a CSRF token", async () => {
    const app = buildApp();
    const roles = await seedDefaultRoles();
    const manager = await createStaffMember(roles.manager);
    const target = await createStaffMember(roles.staff);

    const agent = request.agent(app);
    await loginAs(agent, sessionUserFor(manager, "manager", "Manager", ["staff.view", "staff.manage"]));

    const res = await agent.patch(`/api/staff/${target.id}/role`).send({ roleId: roles.deputy_manager });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("csrf_invalid");
  });

  it("rejects a second Manager while one is already active", async () => {
    const roles = await seedDefaultRoles();
    await createStaffMember(roles.manager);

    const { addStaffMember } = await import("../src/staff/staff.service.js");
    await expect(
      addStaffMember({
        discordUserId: nextDiscordId(),
        discordUsername: "second_manager",
        displayName: "Second Manager",
        roleId: roles.manager,
        discordRoleIds: [],
        addedByDiscordId: "1",
        addedByName: "Tester",
      }),
    ).rejects.toThrow(/only one active/i);
  });

  it("rejects a second Deputy Manager while one is already active, including via role-change", async () => {
    const roles = await seedDefaultRoles();
    await createStaffMember(roles.deputy_manager);
    const staffMember = await createStaffMember(roles.staff);

    const { changeStaffRole } = await import("../src/staff/staff.service.js");
    await expect(changeStaffRole(staffMember.id, roles.deputy_manager, { discordId: "1", name: "Tester" })).rejects.toThrow(
      /only one active/i,
    );
  });

  it("returns a clear 400 (not a generic 500) via the HTTP route when adding a second Manager", async () => {
    vi.resetModules();
    const newDiscordId = nextDiscordId();

    vi.doMock("../src/bot/services/memberService.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/bot/services/memberService.js")>();
      return {
        ...actual,
        fetchGuildMember: vi.fn(async (discordUserId: string) => ({
          id: discordUserId,
          username: "second_manager",
          displayName: "Second Manager",
          avatarUrl: null,
          roleIds: [],
          roles: [],
        })),
      };
    });

    const { buildApp: freshBuildApp, seedDefaultRoles: freshSeedDefaultRoles, createStaffMember: freshCreateStaffMember, sessionUserFor: freshSessionUserFor, loginAs: freshLoginAs } =
      await import("./helpers.js");

    const app = freshBuildApp();
    const roles = await freshSeedDefaultRoles();
    await freshCreateStaffMember(roles.manager);
    // Direct DB insert, bypassing the service's singleton check, purely to
    // set up an actor with real staff.manage permission (requireAuth
    // refreshes permissions from this DB role on every request).
    const adder = await freshCreateStaffMember(roles.manager, { discordUserId: nextDiscordId() });

    const agent = request.agent(app);
    const csrf = await freshLoginAs(agent, freshSessionUserFor(adder, "manager", "Manager", ["staff.view", "staff.manage"]));

    const res = await agent
      .post("/api/staff")
      .set("X-CSRF-Token", csrf)
      .send({ discordUserId: newDiscordId, roleId: roles.manager });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
    expect(res.body.message).toMatch(/only one active/i);

    vi.doUnmock("../src/bot/services/memberService.js");
    vi.resetModules();
  });

  it("allows reassigning the same Manager slot to itself and allows a normal Staff role to have many holders", async () => {
    const roles = await seedDefaultRoles();
    const manager = await createStaffMember(roles.manager);
    await createStaffMember(roles.staff);
    await createStaffMember(roles.staff);

    const { changeStaffRole } = await import("../src/staff/staff.service.js");
    // Re-assigning the current holder to the same singleton role is a no-op, not a conflict.
    await expect(changeStaffRole(manager.id, roles.manager, { discordId: "1", name: "Tester" })).resolves.toBeTruthy();
  });

  it("soft-removes (deactivates) rather than deleting a staff member", async () => {
    const app = buildApp();
    const roles = await seedDefaultRoles();
    const manager = await createStaffMember(roles.manager);
    const target = await createStaffMember(roles.staff);

    const agent = request.agent(app);
    const csrf = await loginAs(agent, sessionUserFor(manager, "manager", "Manager", ["staff.view", "staff.manage"]));

    const res = await agent.delete(`/api/staff/${target.id}`).set("X-CSRF-Token", csrf);
    expect(res.status).toBe(200);

    const { findStaffById } = await import("../src/staff/staff.service.js");
    const stillExists = await findStaffById(target.id);
    expect(stillExists).not.toBeNull();
    expect(stillExists?.status).toBe("INACTIVE");
  });
});
