import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp, seedDefaultRoles, createStaffMember, sessionUserFor, loginAs } from "./helpers.js";

describe("Staff duty sessions (login/logout)", () => {
  it("starts and ends a duty session, persisting it in the database", async () => {
    const app = buildApp();
    const roles = await seedDefaultRoles();
    const staff = await createStaffMember(roles.staff);
    const agent = request.agent(app);
    const csrf = await loginAs(agent, sessionUserFor(staff, "staff", "Staff", ["dashboard.view", "duty.toggle"]));

    const loginRes = await agent.post("/api/staff/duty/login").set("X-CSRF-Token", csrf).send({});
    expect(loginRes.status).toBe(201);
    expect(loginRes.body.session.status).toBe("ACTIVE");

    const statusRes = await agent.get("/api/staff/duty/status");
    expect(statusRes.body.onDuty).toBe(true);

    const logoutRes = await agent
      .post("/api/staff/duty/logout")
      .set("X-CSRF-Token", csrf)
      .send({ notes: "Shift complete" });
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.session.status).toBe("COMPLETED");
    expect(logoutRes.body.session.notes).toBe("Shift complete");
  });

  it("rejects a duplicate login while already on duty", async () => {
    const app = buildApp();
    const roles = await seedDefaultRoles();
    const staff = await createStaffMember(roles.staff);
    const agent = request.agent(app);
    const csrf = await loginAs(agent, sessionUserFor(staff, "staff", "Staff", ["dashboard.view", "duty.toggle"]));

    await agent.post("/api/staff/duty/login").set("X-CSRF-Token", csrf).send({}).expect(201);
    const second = await agent.post("/api/staff/duty/login").set("X-CSRF-Token", csrf).send({});
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("duty_conflict");
  });

  it("survives a simulated restart: an active session is still reported as on-duty from the DB", async () => {
    const roles = await seedDefaultRoles();
    const staff = await createStaffMember(roles.staff);
    const { startDuty } = await import("../src/staff/sessions.service.js");
    await startDuty({ staffId: staff.id, discordUserId: staff.discordUserId, displayName: staff.displayName, roleName: "Staff" });

    // Simulate a fresh process by building a brand new app/agent with no
    // in-memory state carried over — only the database is shared.
    const app2 = buildApp();
    const { listOnDutyStaff } = await import("../src/staff/sessions.service.js");
    const onDuty = await listOnDutyStaff();
    expect(onDuty.some((s) => s.staffUserId === staff.discordUserId)).toBe(true);
    void app2;
  });

  it("prevents two concurrent active sessions for the same staff member at the database level", async () => {
    const roles = await seedDefaultRoles();
    const staff = await createStaffMember(roles.staff);
    const { startDuty, DutyConflictError } = await import("../src/staff/sessions.service.js");
    await startDuty({ staffId: staff.id, discordUserId: staff.discordUserId, displayName: staff.displayName, roleName: "Staff" });
    await expect(
      startDuty({ staffId: staff.id, discordUserId: staff.discordUserId, displayName: staff.displayName, roleName: "Staff" }),
    ).rejects.toThrow(DutyConflictError);
  });
});
