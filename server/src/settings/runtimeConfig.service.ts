import { getSetting } from "./settings.service.js";
import { discordConfig } from "../config/discordConfig.js";

export interface ChannelRouting {
  staffLog: string;
  warningLog: string;
  banLog: string;
}

export interface TestModeState {
  enabled: boolean;
  guildId: string;
  categoryId: string | null;
  channels: ChannelRouting;
  enabledAt: string;
  enabledBy: string;
}

const CHANNEL_ROUTING_KEY = "channel_routing";
const TEST_MODE_KEY = "test_mode";

/**
 * Resolves the channel IDs actually used to send moderation logs.
 *
 * Precedence: Test Mode (if enabled) > custom channel routing saved in
 * Settings > the .env defaults. Test Mode ONLY affects where bot messages
 * are sent — it deliberately does NOT change which guild governs dashboard
 * login/staff verification, so enabling it can never lock real staff out of
 * the dashboard while testing.
 */
export async function getEffectiveChannels(): Promise<ChannelRouting> {
  const testMode = await getTestModeState();
  if (testMode?.enabled) {
    return testMode.channels;
  }

  const custom = await getSetting<Partial<ChannelRouting>>(CHANNEL_ROUTING_KEY);
  return {
    staffLog: custom?.staffLog || discordConfig.channels.staffLog,
    warningLog: custom?.warningLog || discordConfig.channels.warningLog,
    banLog: custom?.banLog || discordConfig.channels.banLog,
  };
}

export async function getCustomChannelRouting(): Promise<Partial<ChannelRouting> | undefined> {
  return getSetting<Partial<ChannelRouting>>(CHANNEL_ROUTING_KEY);
}

export { CHANNEL_ROUTING_KEY };

export async function getTestModeState(): Promise<TestModeState | undefined> {
  return getSetting<TestModeState>(TEST_MODE_KEY);
}

export { TEST_MODE_KEY };
