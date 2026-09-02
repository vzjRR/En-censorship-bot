import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp, seedDefaultRoles, createStaffMember, sessionUserFor, loginAs, startDutyFor, putOnDuty } from "./helpers.js";

async function loginStaff(app: ReturnType<typeof buildApp>) {
  const roles = await seedDefaultRoles();
  const staff = await createStaffMember(roles.staff);
  const agent = request.agent(app);
  const csrf = await loginAs(
    agent,
    sessionUserFor(staff, "staff", "Staff", ["dashboard.view", "duty.toggle", "warnings.view", "warnings.create"]),
  );
  await startDutyFor(agent, csrf);
  return { agent, csrf, staff };
}

describe("Warning system", () => {
  it("creates a warning with a suggested warning number and fixed Discord log fallback status", async () => {
    const app = buildApp();
    const { agent, csrf } = await loginStaff(app);

    const res = await agent
      .post("/api/warnings")
      .set("X-CSRF-Token", csrf)
      .field("playerName", "TestPlayer")
      .field("reason", "RDM")
      .field("durationType", "7_days");

    expect(res.status).toBe(201);
    expect(res.body.warning.warningNumber).toBe(1);
    expect(res.body.warning.warningCode).toMatch(/^WRN-\d{4}-\d{6}$/);
    expect(res.body.warning.status).toBe("ACTIVE");
    // Bot isn't connected in tests, so the log message is expected to fail
    // without corrupting the created record.
    expect(res.body.warning.discordLogStatus).toBe("FAILED");
  });

  it("rejects issuing a warning when the staff member is not on duty", async () => {
    const app = buildApp();
    const roles = await seedDefaultRoles();
    const staff = await createStaffMember(roles.staff);
    const agent = request.agent(app);
    const csrf = await loginAs(
      agent,
      sessionUserFor(staff, "staff", "Staff", ["dashboard.view", "duty.toggle", "warnings.view", "warnings.create"]),
    );
    // Deliberately not calling startDutyFor() here.

    const res = await agent
      .post("/api/warnings")
      .set("X-CSRF-Token", csrf)
      .field("playerName", "OffDutyPlayer")
      .field("reason", "RDM")
      .field("durationType", "7_days");

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("not_on_duty");
  });

  it("rejects a warning with a missing reason", async () => {
    const app = buildApp();
    const { agent, csrf } = await loginStaff(app);

    const res = await agent
      .post("/api/warnings")
      .set("X-CSRF-Token", csrf)
      .field("playerName", "TestPlayer")
      .field("durationType", "7_days");

    expect(res.status).toBe(400);
  });

  it("rejects a warning with a missing player name", async () => {
    const app = buildApp();
    const { agent, csrf } = await loginStaff(app);

    const res = await agent.post("/api/warnings").set("X-CSRF-Token", csrf).field("reason", "RDM").field("durationType", "7_days");

    expect(res.status).toBe(400);
  });

  it("returns the same warning on a duplicate submission with the same idempotency key", async () => {
    const app = buildApp();
    const { agent, csrf } = await loginStaff(app);
    const idempotencyKey = "test-key-123";

    const first = await agent
      .post("/api/warnings")
      .set("X-CSRF-Token", csrf)
      .field("playerName", "DupPlayer")
      .field("reason", "RDM")
      .field("durationType", "7_days")
      .field("idempotencyKey", idempotencyKey);

    const second = await agent
      .post("/api/warnings")
      .set("X-CSRF-Token", csrf)
      .field("playerName", "DupPlayer")
      .field("reason", "RDM")
      .field("durationType", "7_days")
      .field("idempotencyKey", idempotencyKey);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.warning.id).toBe(first.body.warning.id);

    const { listWarnings } = await import("../src/moderation/warnings/warnings.service.js");
    const all = await listWarnings({});
    expect(all.filter((w) => w.idempotencyKey === idempotencyKey).length).toBe(1);
  });

  it("expires an overdue ACTIVE warning via the server-side sweep, not a frontend timer", async () => {
    const roles = await seedDefaultRoles();
    const staff = await createStaffMember(roles.staff);
    await putOnDuty(staff);
    const { createWarning } = await import("../src/moderation/warnings/warnings.service.js");
    const { db } = await import("../src/database/client.js");
    const { warnings } = await import("../src/database/schema/index.js");
    const { eq } = await import("drizzle-orm");

    const warning = await createWarning(
      {
        playerName: "SoonExpired",
        reason: "Fail RP",
        durationType: "1_hour",
        evidenceFiles: [],
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

    // Force it into the past so the sweep picks it up.
    await db.update(warnings).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(warnings.id, warning.id));

    const { expireOverdueWarnings } = await import("../src/moderation/warnings/warnings.service.js");
    const expired = await expireOverdueWarnings();
    expect(expired.some((w) => w.id === warning.id)).toBe(true);

    const reloaded = await db.query.warnings.findFirst({ where: eq(warnings.id, warning.id) });
    expect(reloaded?.status).toBe("EXPIRED");
  });

  it("revokes a warning and records who/why/when", async () => {
    const app = buildApp();
    const roles = await seedDefaultRoles();
    const manager = await createStaffMember(roles.manager);
    const agent = request.agent(app);
    const csrf = await loginAs(
      agent,
      sessionUserFor(manager, "manager", "Manager", ["duty.toggle", "warnings.view", "warnings.create", "warnings.revoke"]),
    );
    await startDutyFor(agent, csrf);

    const created = await agent
      .post("/api/warnings")
      .set("X-CSRF-Token", csrf)
      .field("playerName", "ToRevoke")
      .field("reason", "Toxicity")
      .field("durationType", "3_days");

    const res = await agent
      .post(`/api/warnings/${created.body.warning.id}/revoke`)
      .set("X-CSRF-Token", csrf)
      .send({ reason: "Issued in error" });

    expect(res.status).toBe(200);
    expect(res.body.warning.status).toBe("REVOKED");
    expect(res.body.warning.revokedReason).toBe("Issued in error");
    expect(res.body.warning.revokedByStaffId).toBe(manager.id);
  });
});
