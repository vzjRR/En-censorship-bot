import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp, seedDefaultRoles, createStaffMember, sessionUserFor, loginAs } from "./helpers.js";

// Minimal buffer satisfying the PNG magic-byte signature check in
// evidence/validate.ts — content beyond the header is irrelevant to us.
const FAKE_PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 0)]);

async function loginStaff(app: ReturnType<typeof buildApp>) {
  const roles = await seedDefaultRoles();
  const staff = await createStaffMember(roles.staff);
  const agent = request.agent(app);
  const csrf = await loginAs(
    agent,
    sessionUserFor(staff, "staff", "Staff", ["dashboard.view", "duty.toggle", "bans.view", "bans.create"]),
  );
  return { agent, csrf, staff };
}

describe("Ban system", () => {
  it("rejects a ban with no evidence attached", async () => {
    const app = buildApp();
    const { agent, csrf } = await loginStaff(app);

    const res = await agent
      .post("/api/bans")
      .set("X-CSRF-Token", csrf)
      .field("playerName", "NoEvidencePlayer")
      .field("reason", "RDM")
      .field("durationType", "6_hours");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("evidence_required");
  });

  it("rejects evidence that is not a recognized image/video format regardless of its extension", async () => {
    const app = buildApp();
    const { agent, csrf } = await loginStaff(app);

    const res = await agent
      .post("/api/bans")
      .set("X-CSRF-Token", csrf)
      .field("playerName", "BadEvidencePlayer")
      .field("reason", "RDM")
      .field("durationType", "6_hours")
      .attach("evidence", Buffer.from("not a real image"), { filename: "proof.png", contentType: "image/png" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_evidence");
  });

  it("issues a ban with valid evidence and generates a BAN-YYYY-###### code", async () => {
    const app = buildApp();
    const { agent, csrf } = await loginStaff(app);

    const res = await agent
      .post("/api/bans")
      .set("X-CSRF-Token", csrf)
      .field("playerName", "BannedPlayer")
      .field("reason", "RDM")
      .field("durationType", "6_hours")
      .attach("evidence", FAKE_PNG, { filename: "proof.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body.ban.banCode).toMatch(/^BAN-\d{4}-\d{6}$/);
    expect(res.body.ban.status).toBe("ACTIVE");
    expect(res.body.ban.expiresAt).not.toBeNull();
  });

  it("prevents a double-submission from creating two bans", async () => {
    const app = buildApp();
    const { agent, csrf } = await loginStaff(app);
    const idempotencyKey = "ban-dup-key";

    const [first, second] = await Promise.all([
      agent
        .post("/api/bans")
        .set("X-CSRF-Token", csrf)
        .field("playerName", "DoubleSubmitPlayer")
        .field("reason", "VDM")
        .field("durationType", "1_day")
        .field("idempotencyKey", idempotencyKey)
        .attach("evidence", FAKE_PNG, { filename: "proof.png", contentType: "image/png" }),
      agent
        .post("/api/bans")
        .set("X-CSRF-Token", csrf)
        .field("playerName", "DoubleSubmitPlayer")
        .field("reason", "VDM")
        .field("durationType", "1_day")
        .field("idempotencyKey", idempotencyKey)
        .attach("evidence", FAKE_PNG, { filename: "proof.png", contentType: "image/png" }),
    ]);

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.body.ban.id).toBe(second.body.ban.id);

    const { listBans } = await import("../src/moderation/bans/bans.service.js");
    const all = await listBans({});
    expect(all.filter((b) => b.idempotencyKey === idempotencyKey).length).toBe(1);
  });

  it("keeps a permanent ban ACTIVE forever (no expiresAt, not swept)", async () => {
    const app = buildApp();
    const { agent, csrf } = await loginStaff(app);

    const res = await agent
      .post("/api/bans")
      .set("X-CSRF-Token", csrf)
      .field("playerName", "PermaBannedPlayer")
      .field("reason", "Cheating")
      .field("durationType", "PERMANENT")
      .attach("evidence", FAKE_PNG, { filename: "proof.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body.ban.expiresAt).toBeNull();

    const { expireOverdueBans } = await import("../src/moderation/bans/bans.service.js");
    const expired = await expireOverdueBans();
    expect(expired.some((b) => b.id === res.body.ban.id)).toBe(false);
  });

  it("revokes a ban and records who/why/when", async () => {
    const app = buildApp();
    const roles = await seedDefaultRoles();
    const manager = await createStaffMember(roles.manager);
    const agent = request.agent(app);
    const csrf = await loginAs(agent, sessionUserFor(manager, "manager", "Manager", ["bans.view", "bans.create", "bans.revoke"]));

    const created = await agent
      .post("/api/bans")
      .set("X-CSRF-Token", csrf)
      .field("playerName", "ToRevokeBan")
      .field("reason", "RDM")
      .field("durationType", "1_day")
      .attach("evidence", FAKE_PNG, { filename: "proof.png", contentType: "image/png" });

    const res = await agent
      .post(`/api/bans/${created.body.ban.id}/revoke`)
      .set("X-CSRF-Token", csrf)
      .send({ reason: "Appeal accepted" });

    expect(res.status).toBe(200);
    expect(res.body.ban.status).toBe("REVOKED");
    expect(res.body.ban.revokedReason).toBe("Appeal accepted");
  });
});
