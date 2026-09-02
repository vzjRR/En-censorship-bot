import { getActiveDutySession } from "../staff/sessions.service.js";

export class NotOnDutyError extends Error {}

/**
 * Staff must be on duty (clocked in via "دخول الرقابة") before they can
 * issue a warning or ban — enforced server-side so a client that hides the
 * "Issue Warning/Ban" button when off duty is a UX nicety, not the actual
 * boundary. Applies to everyone, including the platform owner.
 */
export async function assertOnDuty(discordUserId: string): Promise<void> {
  const active = await getActiveDutySession(discordUserId);
  if (!active) {
    throw new NotOnDutyError("You must be on duty (دخول الرقابة) before you can issue a warning or ban.");
  }
}
