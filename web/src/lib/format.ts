const TIMEZONE = "Asia/Muscat";

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date).replace(",", ",");
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormatter.format(date);
}

export function durationLabel(durationType: string, durationHours: number | null): string {
  if (durationType === "PERMANENT") return "Permanent";
  if (durationType === "CUSTOM") {
    if (durationHours == null) return "Custom";
    return durationHours % 24 === 0 ? `${durationHours / 24} day(s)` : `${durationHours} hour(s)`;
  }
  return durationType.replace(/_/g, " ");
}
