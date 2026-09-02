import { ChannelType } from "discord.js";
import { getGuildById } from "../bot/client.js";
import { getSetting, setSetting } from "./settings.service.js";
import { recordAuditLog, AUDIT_ACTIONS } from "../audit/audit.service.js";
import { TEST_MODE_KEY, type TestModeState } from "./runtimeConfig.service.js";

export class TestModeError extends Error {}

const CATEGORY_NAME = "ENCLAVE TEST MODE";
const CHANNEL_NAMES = {
  staffLog: "mod-staff-log-test",
  warningLog: "mod-warnings-test",
  banLog: "mod-bans-test",
} as const;

export async function getTestModeStatus(): Promise<TestModeState | undefined> {
  return getSetting<TestModeState>(TEST_MODE_KEY);
}

/**
 * Points moderation message routing at a sandbox guild: creates a category
 * + three text channels there (bot must already be a member of that
 * guild), and stores their IDs so every warning/ban/staff-duty message goes
 * there instead of the real channels until disableTestMode() is called.
 *
 * This intentionally does NOT touch dashboard login/staff verification —
 * only where automated messages are sent. See runtimeConfig.service.ts.
 */
export async function enableTestMode(
  guildId: string,
  actor: { discordId: string; name: string },
): Promise<TestModeState> {
  if (!/^\d{15,25}$/.test(guildId)) {
    throw new TestModeError("That doesn't look like a valid Discord server ID.");
  }

  const existing = await getTestModeStatus();
  if (existing?.enabled) {
    throw new TestModeError(
      "Test Mode is already enabled. Disable it first (with or without cleanup) before enabling it again.",
    );
  }

  let guild;
  try {
    guild = await getGuildById(guildId);
  } catch (err) {
    throw new TestModeError(
      `Could not access Discord server ${guildId}. Make sure the bot has been invited to that server first. (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
  }

  const category = await guild.channels.create({ name: CATEGORY_NAME, type: ChannelType.GuildCategory });
  const staffLog = await guild.channels.create({ name: CHANNEL_NAMES.staffLog, type: ChannelType.GuildText, parent: category.id });
  const warningLog = await guild.channels.create({ name: CHANNEL_NAMES.warningLog, type: ChannelType.GuildText, parent: category.id });
  const banLog = await guild.channels.create({ name: CHANNEL_NAMES.banLog, type: ChannelType.GuildText, parent: category.id });

  const state: TestModeState = {
    enabled: true,
    guildId,
    categoryId: category.id,
    channels: { staffLog: staffLog.id, warningLog: warningLog.id, banLog: banLog.id },
    enabledAt: new Date().toISOString(),
    enabledBy: actor.name,
  };

  await setSetting(TEST_MODE_KEY, state, actor.discordId);

  await recordAuditLog({
    actorDiscordId: actor.discordId,
    actorName: actor.name,
    action: AUDIT_ACTIONS.TEST_MODE_ENABLED,
    targetType: "test_mode",
    targetId: guildId,
    metadata: { guildId, channels: state.channels, categoryId: category.id },
  });

  return state;
}

export interface DisableTestModeResult {
  state: TestModeState;
  cleanupErrors: string[];
}

/**
 * Turns Test Mode off. When `cleanup` is true (the default), also deletes
 * every channel/category it created in the test guild — the bot needs
 * Manage Channels permission there for this to succeed. Deletion is
 * best-effort per-channel: one failure (already deleted, missing
 * permission) doesn't block the others, and is reported back rather than
 * thrown.
 */
export async function disableTestMode(
  actor: { discordId: string; name: string },
  cleanup = true,
): Promise<DisableTestModeResult> {
  const existing = await getTestModeStatus();
  if (!existing?.enabled) {
    throw new TestModeError("Test Mode is not currently enabled.");
  }

  const cleanupErrors: string[] = [];

  if (cleanup) {
    const idsToDelete = [existing.channels.staffLog, existing.channels.warningLog, existing.channels.banLog, existing.categoryId].filter(
      (id): id is string => Boolean(id),
    );

    try {
      const guild = await getGuildById(existing.guildId);
      for (const id of idsToDelete) {
        try {
          const channel = await guild.channels.fetch(id).catch(() => null);
          if (channel) await channel.delete("ENCLAVE RP Test Mode cleanup");
        } catch (err) {
          cleanupErrors.push(`Failed to delete channel ${id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      cleanupErrors.push(`Could not access test server ${existing.guildId} to clean up: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const state: TestModeState = { ...existing, enabled: false };
  await setSetting(TEST_MODE_KEY, state, actor.discordId);

  await recordAuditLog({
    actorDiscordId: actor.discordId,
    actorName: actor.name,
    action: AUDIT_ACTIONS.TEST_MODE_DISABLED,
    targetType: "test_mode",
    targetId: existing.guildId,
    metadata: { cleanup, cleanupErrors },
  });

  return { state, cleanupErrors };
}
