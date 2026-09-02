import { describe, it, expect, vi } from "vitest";
import { seedDefaultRoles, createStaffMember, nextDiscordId, putOnDuty } from "./helpers.js";

const FAKE_PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 0)]);

describe("Staff welcome DM", () => {
  it("sends a welcome DM to a newly added staff member with their role and capabilities", async () => {
    vi.resetModules();
    const dms: Array<{ discordUserId: string; content: string }> = [];

    vi.doMock("../src/bot/services/logService.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/bot/services/logService.js")>();
      return {
        ...actual,
        sendDirectMessage: vi.fn(async (discordUserId: string, content: string) => {
          dms.push({ discordUserId, content });
          return { status: "SENT" };
        }),
      };
    });

    const { seedDefaultRoles: freshSeedDefaultRoles } = await import("./helpers.js");
    const { addStaffMember } = await import("../src/staff/staff.service.js");
    const roles = await freshSeedDefaultRoles();
    const newDiscordId = nextDiscordId();

    await addStaffMember({
      discordUserId: newDiscordId,
      discordUsername: "newbie",
      displayName: "New Staff",
      roleId: roles.staff,
      discordRoleIds: [],
      addedByDiscordId: "1",
      addedByName: "Tester",
    });

    expect(dms.length).toBe(1);
    expect(dms[0].discordUserId).toBe(newDiscordId);
    expect(dms[0].content).toContain("New Staff");
    expect(dms[0].content).toContain("Staff");
    expect(dms[0].content).toContain("إصدار تحذير");

    vi.doUnmock("../src/bot/services/logService.js");
    vi.resetModules();
  });
});

describe("Player + Manager notifications on warning/ban", () => {
  it("DMs the player and the active Manager when a warning is issued (but not the Manager if they issued it themselves)", async () => {
    vi.resetModules();
    const dms: Array<{ discordUserId: string; content: string }> = [];

    vi.doMock("../src/bot/services/logService.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/bot/services/logService.js")>();
      return {
        ...actual,
        sendDirectMessage: vi.fn(async (discordUserId: string, content: string) => {
          dms.push({ discordUserId, content });
          return { status: "SENT" };
        }),
      };
    });

    const roles = await seedDefaultRoles();
    const staff = await createStaffMember(roles.staff);
    const manager = await createStaffMember(roles.manager);
    await putOnDuty(staff);

    const { createWarning } = await import("../src/moderation/warnings/warnings.service.js");
    const playerDiscordId = nextDiscordId();

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

    await createWarning(
      { playerDiscordId, playerName: "WarnedPlayer", reason: "RDM", durationType: "7_days", evidenceFiles: [] },
      actor,
    );

    const playerDm = dms.find((d) => d.discordUserId === playerDiscordId);
    const managerDm = dms.find((d) => d.discordUserId === manager.discordUserId);

    expect(playerDm).toBeDefined();
    expect(playerDm!.content).toContain("RDM");

    expect(managerDm).toBeDefined();
    expect(managerDm!.content).toContain("warning 1");

    vi.doUnmock("../src/bot/services/logService.js");
    vi.resetModules();
  });

  it("DMs the player and the active Manager when a ban is issued", async () => {
    vi.resetModules();
    const dms: Array<{ discordUserId: string; content: string }> = [];

    vi.doMock("../src/bot/services/logService.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/bot/services/logService.js")>();
      return {
        ...actual,
        sendDirectMessage: vi.fn(async (discordUserId: string, content: string) => {
          dms.push({ discordUserId, content });
          return { status: "SENT" };
        }),
      };
    });

    const roles = await seedDefaultRoles();
    const staff = await createStaffMember(roles.staff);
    const manager = await createStaffMember(roles.manager);
    await putOnDuty(staff);

    const { createBan } = await import("../src/moderation/bans/bans.service.js");
    const playerDiscordId = nextDiscordId();

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

    await createBan(
      {
        playerDiscordId,
        playerName: "BannedPlayer",
        reason: "Cheating",
        durationType: "6_hours",
        evidenceFiles: [{ buffer: FAKE_PNG, originalname: "a.png", mimetype: "image/png", size: FAKE_PNG.length }],
      },
      actor,
    );

    const playerDm = dms.find((d) => d.discordUserId === playerDiscordId);
    const managerDm = dms.find((d) => d.discordUserId === manager.discordUserId);

    expect(playerDm).toBeDefined();
    expect(playerDm!.content).toContain("Cheating");

    expect(managerDm).toBeDefined();
    expect(managerDm!.content).toContain("Cheating");

    vi.doUnmock("../src/bot/services/logService.js");
    vi.resetModules();
  });
});
