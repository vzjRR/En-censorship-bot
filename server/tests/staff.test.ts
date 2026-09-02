import { describe, it, expect } from "vitest";
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
