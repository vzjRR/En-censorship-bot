import { describe, it, expect } from "vitest";
import {
  staffLoginMessage,
  staffLogoutMessage,
  warningLogMessage,
  banLogMessage,
  warningRevokedMessage,
  banRevokedMessage,
} from "../src/bot/services/messageTemplates.js";

describe("Fixed Discord message templates", () => {
  it("formats the staff login message with only the dynamic fields changing", async () => {
    const msg = await staffLoginMessage({ staffName: "Ahmed", staffRole: "Manager", loginTime: new Date("2026-08-18T10:35:00Z") });
    expect(msg).toContain("دخول الرقابة:");
    expect(msg).toContain("**الاسم:** `Ahmed`");
    // No backticks — staffRole is a role MENTION when called from
    // sessions.service.ts, and Discord never parses mentions inside inline code.
    expect(msg).toContain("**الرتبة:** Manager");
    expect(msg).toMatch(/\*\*وقت الدخول:\*\* `\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}`/);
  });

  it("formats the staff logout message including optional notes", async () => {
    const msg = await staffLogoutMessage({
      staffName: "Ahmed",
      staffRole: "Manager",
      logoutTime: new Date("2026-08-18T14:00:00Z"),
      notes: "All clear",
    });
    expect(msg).toContain("خروج الرقابة:");
    expect(msg).toContain("**ملاحظات:** `All clear`");
  });

  it("formats the warning message with the exact required layout, mentioning the player and staff (with their Discord role)", async () => {
    const msg = await warningLogMessage({
      playerDiscordId: "123456789012345678",
      playerName: "Fallback Name",
      warningNumber: 1,
      reason: "RDM",
      issuedAt: new Date("2026-08-18T09:00:00Z"),
      durationType: "7_days",
      durationHours: 168,
      staffName: "Staff Name",
      staffDiscordId: "999999999999999999",
      staffRole: "Head Staff",
    });

    expect(msg).toContain("**اسم اللاعب:** <@123456789012345678>");
    expect(msg).toContain("**رقم الورنيج:** `warning 1`");
    expect(msg).toContain("**سبب الورنيج:** `RDM`");
    expect(msg).toContain("**مدة الورنيج:** `7 أيام`");
    expect(msg).toContain("**اسم الرقابي:** <@999999999999999999> (`Head Staff`)");
  });

  it("falls back to the player name when no Discord ID is known", async () => {
    const msg = await warningLogMessage({
      playerDiscordId: null,
      playerName: "Fallback Name",
      warningNumber: 2,
      reason: "VDM",
      issuedAt: new Date(),
      durationType: "PERMANENT",
      durationHours: null,
      staffName: "Staff Name",
      staffDiscordId: "999999999999999999",
      staffRole: "Head Staff",
    });
    expect(msg).toContain("**اسم اللاعب:** Fallback Name");
    expect(msg).toContain("**مدة الورنيج:** `دائم`");
  });

  it("formats the ban message with the exact required layout, showing names (not just IDs) for player and staff, and the FiveM ID only when provided", async () => {
    const msg = await banLogMessage({
      fivemIdentifier: "steam:1100001",
      playerDiscordId: "123456789012345678",
      playerName: "Player",
      reason: "تكويت في نص سناريو",
      issuedAt: new Date("2026-08-31T12:00:00Z"),
      durationType: "6_hours",
      durationHours: 6,
      staffDiscordId: "999999999999999999",
      staffName: "Staff Name",
      staffRole: "Head Staff",
    });

    expect(msg).toContain("**Player id:** `steam:1100001`");
    expect(msg).toContain("**Player:** <@123456789012345678> `Player`");
    expect(msg).not.toContain("**Band:**");
    expect(msg).toContain("**Reason:** `تكويت في نص سناريو`");
    expect(msg).toMatch(/\*\*Date:\*\* `\d{1,2}-\d{1,2}-\d{2}`/);
    expect(msg).toContain("**Band time:** `6 h`");
    expect(msg).toContain("**Censorship name:** <@999999999999999999> `Staff Name` (Head Staff)");
  });

  it("omits the Player id line when staff didn't provide a FiveM identifier, and falls back to the player name when no Discord ID is known", async () => {
    const msg = await banLogMessage({
      fivemIdentifier: null,
      playerDiscordId: null,
      playerName: "No Discord Player",
      reason: "Cheating",
      issuedAt: new Date(),
      durationType: "PERMANENT",
      durationHours: null,
      staffDiscordId: "999999999999999999",
      staffName: "Staff Name",
      staffRole: "Head Staff",
    });
    expect(msg).not.toContain("Player id");
    expect(msg).toContain("**Player:** No Discord Player `No Discord Player`");
  });

  it("formats the warning-revoked message with the reason and who revoked it", async () => {
    const msg = await warningRevokedMessage({
      playerDiscordId: "123456789012345678",
      playerName: "Fallback Name",
      warningNumber: 1,
      revokeReason: "Issued in error",
      revokedAt: new Date("2026-08-19T09:00:00Z"),
      staffDiscordId: "999999999999999999",
      staffName: "Staff Name",
      staffRole: "Head Staff",
    });
    expect(msg).toContain("**اسم اللاعب:** <@123456789012345678>");
    expect(msg).toContain("**رقم الورنيج:** `warning 1`");
    expect(msg).toContain("**سبب الإلغاء:** `Issued in error`");
    expect(msg).toContain("**بواسطة:** <@999999999999999999> `Staff Name` (Head Staff)");
  });

  it("formats the ban-revoked message with the reason and who revoked it", async () => {
    const msg = await banRevokedMessage({
      playerDiscordId: null,
      playerName: "Appealed Player",
      revokeReason: "Appeal accepted",
      revokedAt: new Date("2026-08-19T09:00:00Z"),
      staffDiscordId: "999999999999999999",
      staffName: "Staff Name",
      staffRole: "Head Staff",
    });
    expect(msg).toContain("**Player:** Appealed Player `Appealed Player`");
    expect(msg).toContain("**Reason:** `Appeal accepted`");
    expect(msg).toContain("**By:** <@999999999999999999> `Staff Name` (Head Staff)");
  });

  it("uses a custom template override when one has been saved, and reverts when cleared", async () => {
    const { setTemplateOverride, resetTemplateOverride } = await import("../src/settings/templates.service.js");
    await setTemplateOverride("staff_login", "ON DUTY: {{staffName}} ({{staffRole}}) at {{loginTime}}", "tester");

    const custom = await staffLoginMessage({ staffName: "Ahmed", staffRole: "Manager", loginTime: new Date("2026-08-18T10:35:00Z") });
    expect(custom).toContain("ON DUTY: Ahmed (Manager)");
    expect(custom).not.toContain("دخول الرقابة:");

    await resetTemplateOverride("staff_login", "tester");
    const reverted = await staffLoginMessage({ staffName: "Ahmed", staffRole: "Manager", loginTime: new Date("2026-08-18T10:35:00Z") });
    expect(reverted).toContain("دخول الرقابة:");
  });
});
