import { describe, it, expect } from "vitest";
import { staffLoginMessage, staffLogoutMessage, warningLogMessage, banLogMessage } from "../src/bot/services/messageTemplates.js";

describe("Fixed Discord message templates", () => {
  it("formats the staff login message with only the dynamic fields changing", () => {
    const msg = staffLoginMessage({ staffName: "Ahmed", staffRole: "Manager", loginTime: new Date("2026-08-18T10:35:00Z") });
    expect(msg).toContain("دخول الرقابة:");
    expect(msg).toContain("الاسم: Ahmed");
    expect(msg).toContain("الرتبة: Manager");
    expect(msg).toMatch(/وقت الدخول: \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
  });

  it("formats the staff logout message including optional notes", () => {
    const msg = staffLogoutMessage({
      staffName: "Ahmed",
      staffRole: "Manager",
      logoutTime: new Date("2026-08-18T14:00:00Z"),
      notes: "All clear",
    });
    expect(msg).toContain("خروج الرقابة:");
    expect(msg).toContain("ملاحظات: All clear");
  });

  it("formats the warning message with the exact required layout", () => {
    const msg = warningLogMessage({
      playerDiscordId: "123456789012345678",
      playerName: "Fallback Name",
      warningNumber: 1,
      reason: "RDM",
      issuedAt: new Date("2026-08-18T09:00:00Z"),
      durationType: "7_days",
      durationHours: 168,
      staffName: "Staff Name",
    });

    expect(msg).toContain("**يتم تسجيل الورنيج بالصيغة التالية:**");
    expect(msg).toContain("اسم اللاعب: <@123456789012345678>");
    expect(msg).toContain("رقم الورنيج: warning 1");
    expect(msg).toContain("سبب الورنيج: RDM");
    expect(msg).toContain("مدة الورنيج: 7 أيام");
    expect(msg).toContain("اسم الرقابي: Staff Name");
  });

  it("falls back to the player name when no Discord ID is known", () => {
    const msg = warningLogMessage({
      playerDiscordId: null,
      playerName: "Fallback Name",
      warningNumber: 2,
      reason: "VDM",
      issuedAt: new Date(),
      durationType: "PERMANENT",
      durationHours: null,
      staffName: "Staff Name",
    });
    expect(msg).toContain("اسم اللاعب: Fallback Name");
    expect(msg).toContain("مدة الورنيج: دائم");
  });

  it("formats the ban message with the exact required layout", () => {
    const msg = banLogMessage({
      fivemIdentifier: "steam:1100001",
      playerDiscordId: "123456789012345678",
      playerName: "Player",
      reason: "تكويت في نص سناريو",
      issuedAt: new Date("2026-08-31T12:00:00Z"),
      durationType: "6_hours",
      durationHours: 6,
      staffDiscordId: "999999999999999999",
    });

    expect(msg).toContain("player id : steam:1100001");
    expect(msg).toContain("band: 6 h");
    expect(msg).toContain("Reason: تكويت في نص سناريو");
    expect(msg).toMatch(/date: \d{1,2}-\d{1,2}-\d{2}/);
    expect(msg).toContain("band time : 6 h");
    expect(msg).toContain("censorhip name: <@999999999999999999>");
  });
});
