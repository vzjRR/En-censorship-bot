import { DateTime } from "luxon";

export const DURATION_TYPES = [
  "1_hour",
  "6_hours",
  "12_hours",
  "1_day",
  "3_days",
  "7_days",
  "14_days",
  "30_days",
  "PERMANENT",
  "CUSTOM",
] as const;

export type DurationType = (typeof DURATION_TYPES)[number];

const FIXED_DURATION_HOURS: Partial<Record<DurationType, number>> = {
  "1_hour": 1,
  "6_hours": 6,
  "12_hours": 12,
  "1_day": 24,
  "3_days": 72,
  "7_days": 168,
  "14_days": 336,
  "30_days": 720,
};

export interface ResolvedDuration {
  durationType: DurationType;
  durationHours: number | null;
  expiresAt: Date | null;
}

/**
 * Resolves a duration selection into a concrete duration-in-hours and
 * absolute expiry timestamp, anchored to `issuedAt`. PERMANENT never
 * expires. CUSTOM requires an explicit `customHours` value from the caller.
 */
export function resolveDuration(
  durationType: DurationType,
  issuedAt: Date,
  customHours?: number | null,
): ResolvedDuration {
  if (durationType === "PERMANENT") {
    return { durationType, durationHours: null, expiresAt: null };
  }

  let hours: number;
  if (durationType === "CUSTOM") {
    if (!customHours || customHours <= 0) {
      throw new Error("A positive custom duration (in hours) is required for CUSTOM duration type.");
    }
    hours = Math.round(customHours);
  } else {
    hours = FIXED_DURATION_HOURS[durationType]!;
  }

  const expiresAt = DateTime.fromJSDate(issuedAt).plus({ hours }).toJSDate();
  return { durationType, durationHours: hours, expiresAt };
}

const ARABIC_DAY_LABELS: Partial<Record<DurationType, string>> = {
  "1_day": "يوم واحد",
  "3_days": "3 أيام",
  "7_days": "7 أيام",
  "14_days": "14 يوم",
  "30_days": "30 يوم",
};

/** Arabic label used in the Warning Discord log message ("مدة الورنيج"). */
export function formatDurationArabic(durationType: DurationType, durationHours: number | null): string {
  if (durationType === "PERMANENT") return "دائم";
  if (durationType in ARABIC_DAY_LABELS) return ARABIC_DAY_LABELS[durationType]!;
  if (durationHours == null) return "غير محدد";
  if (durationHours % 24 === 0) return `${durationHours / 24} يوم`;
  return `${durationHours} ساعة`;
}

/** Compact "6 h" / "1 d" style label used in the Ban Discord log message template. */
export function formatDurationShort(durationType: DurationType, durationHours: number | null): string {
  if (durationType === "PERMANENT") return "permanent";
  if (durationHours == null) return "n/a";
  if (durationHours % 24 === 0) return `${durationHours / 24} d`;
  return `${durationHours} h`;
}
