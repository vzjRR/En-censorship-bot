import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { buildApp, seedDefaultRoles, createStaffMember, sessionUserFor, loginAs } from "./helpers.js";

describe("Message templates (Settings → Messages)", () => {
  it("requires messages.manage to view or edit templates", async () => {
    const app = buildApp();
    const roles = await seedDefaultRoles();
    const staff = await createStaffMember(roles.staff);
    const agent = request.agent(app);
    await loginAs(agent, sessionUserFor(staff, "staff", "Staff", ["dashboard.view"]));

    const res = await agent.get("/api/settings/templates");
    expect(res.status).toBe(403);
  });

  it("lets a manager edit a template and reset it back to default", async () => {
    const app = buildApp();
    const roles = await seedDefaultRoles();
    const manager = await createStaffMember(roles.manager);
    const agent = request.agent(app);
    const csrf = await loginAs(agent, sessionUserFor(manager, "manager", "Manager", ["messages.manage"]));

    const before = await agent.get("/api/settings/templates").expect(200);
    const loginTemplate = before.body.templates.find((t: any) => t.key === "staff_login");
    expect(loginTemplate.isCustom).toBe(false);

    await agent
      .put("/api/settings/templates/staff_login")
      .set("X-CSRF-Token", csrf)
      .send({ template: "Custom: {{staffName}}" })
      .expect(200);

    const after = await agent.get("/api/settings/templates").expect(200);
    const updated = after.body.templates.find((t: any) => t.key === "staff_login");
    expect(updated.isCustom).toBe(true);
    expect(updated.current).toBe("Custom: {{staffName}}");

    await agent.put("/api/settings/templates/staff_login").set("X-CSRF-Token", csrf).send({ template: "" }).expect(200);
    const reset = await agent.get("/api/settings/templates").expect(200);
    expect(reset.body.templates.find((t: any) => t.key === "staff_login").isCustom).toBe(false);
  });
});

describe("Channel routing (Settings → Channels)", () => {
  it("requires channels.manage and persists a custom channel override", async () => {
    const app = buildApp();
    const roles = await seedDefaultRoles();
    const manager = await createStaffMember(roles.manager);
    const agent = request.agent(app);
    const csrf = await loginAs(agent, sessionUserFor(manager, "manager", "Manager", ["channels.manage"]));

    const res = await agent
      .put("/api/settings/channels")
      .set("X-CSRF-Token", csrf)
      .send({ warningLog: "222222222222222222" })
      .expect(200);
    expect(res.body.routing.warningLog).toBe("222222222222222222");

    const { getEffectiveChannels } = await import("../src/settings/runtimeConfig.service.js");
    const effective = await getEffectiveChannels();
    expect(effective.warningLog).toBe("222222222222222222");
  });
});

describe("Test Mode", () => {
  it("creates channels in the test guild on enable, and deletes them on disable with cleanup", async () => {
    vi.resetModules();

    const created: string[] = [];
    const deleted: string[] = [];
    const fakeChannels: Record<string, { id: string; delete: () => Promise<void> }> = {};

    vi.doMock("../src/bot/client.js", () => ({
      getGuildById: vi.fn(async (guildId: string) => ({
        id: guildId,
        channels: {
          create: vi.fn(async ({ name }: { name: string }) => {
            const id = `chan-${name}`;
            created.push(id);
            fakeChannels[id] = {
              id,
              delete: async () => {
                deleted.push(id);
              },
            };
            return fakeChannels[id];
          }),
          fetch: vi.fn(async (id: string) => fakeChannels[id] ?? null),
        },
      })),
      isBotReady: () => true,
    }));

    const { enableTestMode, disableTestMode } = await import("../src/settings/testMode.service.js");

    const state = await enableTestMode("1511102113135202456", { discordId: "1", name: "Owner" });
    expect(state.enabled).toBe(true);
    expect(state.guildId).toBe("1511102113135202456");
    expect(created.length).toBe(4); // category + 3 channels

    const { cleanupErrors, state: finalState } = await disableTestMode({ discordId: "1", name: "Owner" }, true);
    expect(finalState.enabled).toBe(false);
    expect(cleanupErrors).toEqual([]);
    expect(deleted.length).toBe(4);

    vi.doUnmock("../src/bot/client.js");
    vi.resetModules();
  });
});
