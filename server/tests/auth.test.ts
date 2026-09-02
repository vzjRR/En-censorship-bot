import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp, seedDefaultRoles, seedOwnerRole, createStaffMember, sessionUserFor, loginAs } from "./helpers.js";

describe("Authentication & Authorization", () => {
  it("rejects an unauthorized (not logged in) user with 401", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/staff");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthenticated");
  });

  it("allows an authorized staff member to view their own status", async () => {
    const app = buildApp();
    const roles = await seedDefaultRoles();
    const staff = await createStaffMember(roles.staff);
    const agent = request.agent(app);
    await loginAs(agent, sessionUserFor(staff, "staff", "Staff", ["dashboard.view", "duty.toggle"]));

    const res = await agent.get("/api/staff/duty/status");
    expect(res.status).toBe(200);
    expect(res.body.onDuty).toBe(false);
  });

  it("allows a manager to view the staff list", async () => {
    const app = buildApp();
    const roles = await seedDefaultRoles();
    const manager = await createStaffMember(roles.manager);
    const agent = request.agent(app);
    await loginAs(agent, sessionUserFor(manager, "manager", "Manager", ["staff.view", "staff.manage"]));

    const res = await agent.get("/api/staff");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.staff)).toBe(true);
  });

  it("grants the platform owner full access even without matching DB permissions", async () => {
    const app = buildApp();
    const ownerRoleId = await seedOwnerRole();
    const owner = await createStaffMember(ownerRoleId, { discordUserId: "1303195553068482591" });
    const agent = request.agent(app);
    await loginAs(agent, sessionUserFor(owner, "platform_owner", "Platform Owner", [], true));

    const res = await agent.get("/api/settings");
    expect(res.status).toBe(200);
  });

  it("denies access after staff status becomes INACTIVE (revocation takes effect immediately)", async () => {
    const app = buildApp();
    const roles = await seedDefaultRoles();
    const staff = await createStaffMember(roles.staff);
    const agent = request.agent(app);
    await loginAs(agent, sessionUserFor(staff, "staff", "Staff", ["dashboard.view", "duty.toggle"]));

    // First request succeeds.
    await agent.get("/api/staff/duty/status").expect(200);

    // Deactivate directly in the DB (simulating a manager removing them).
    const { db } = await import("../src/database/client.js");
    const { staffMembers } = await import("../src/database/schema/index.js");
    const { eq } = await import("drizzle-orm");
    await db.update(staffMembers).set({ status: "INACTIVE" }).where(eq(staffMembers.id, staff.id));

    const res = await agent.get("/api/staff/duty/status");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("access_revoked");
  });

  it("denies a staff member permission-gated routes reserved for managers (role escalation attempt)", async () => {
    const app = buildApp();
    const roles = await seedDefaultRoles();
    const staff = await createStaffMember(roles.staff);
    const agent = request.agent(app);
    await loginAs(agent, sessionUserFor(staff, "staff", "Staff", ["dashboard.view", "duty.toggle"]));

    const res = await agent.post("/api/staff").send({ discordUserId: "900000000000000099", roleId: roles.staff });
    expect(res.status).toBe(403);
  });
});
