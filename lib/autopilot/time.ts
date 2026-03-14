const WEEKDAY_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

export interface WeeklyScheduleConfig {
  timezone: string;
  weekday: number;
  hour: number;
  minute: number;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function parsePart(parts: Intl.DateTimeFormatPart[], type: string) {
  const value = parts.find((part) => part.type === type)?.value ?? "0";
  return Number.parseInt(value, 10);
}

function getZonedParts(date: Date, timezone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  return {
    year: parsePart(parts, "year"),
    month: parsePart(parts, "month"),
    day: parsePart(parts, "day"),
    hour: parsePart(parts, "hour"),
    minute: parsePart(parts, "minute"),
    second: parsePart(parts, "second"),
  };
}

function getZonedWeekday(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const value = formatter.format(date).toLowerCase().slice(0, 3);
  return WEEKDAY_INDEX[value] ?? 0;
}

function toUtcForZonedDateTime(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
) {
  let utcMillis = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  for (let i = 0; i < 4; i += 1) {
    const zoned = getZonedParts(new Date(utcMillis), timezone);
    const desired = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const actual = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      0,
      0,
    );
    const delta = desired - actual;
    if (Math.abs(delta) < 60_000) {
      break;
    }
    utcMillis += delta;
  }

  return new Date(utcMillis);
}

export function computeNextWeeklyRunAt(
  schedule: WeeklyScheduleConfig,
  fromDate = new Date(),
) {
  const probe = new Date(fromDate.getTime() + 60_000);

  for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
    const dayProbe = new Date(
      probe.getTime() + dayOffset * 24 * 60 * 60 * 1000,
    );
    const weekday = getZonedWeekday(dayProbe, schedule.timezone);
    if (weekday !== schedule.weekday) {
      continue;
    }

    const localDate = getZonedParts(dayProbe, schedule.timezone);
    const candidate = toUtcForZonedDateTime(
      schedule.timezone,
      localDate.year,
      localDate.month,
      localDate.day,
      schedule.hour,
      schedule.minute,
    );

    if (candidate.getTime() > fromDate.getTime()) {
      return candidate;
    }
  }

  return new Date(fromDate.getTime() + 7 * 24 * 60 * 60 * 1000);
}

export function computeIsoWeekKey(date: Date, timezone: string) {
  const zoned = getZonedParts(date, timezone);
  const utcDate = new Date(Date.UTC(zoned.year, zoned.month - 1, zoned.day));
  const dayNum = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - dayNum + 3);

  const isoYear = utcDate.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);

  const week =
    1 + Math.round((utcDate.getTime() - firstThursday.getTime()) / 604_800_000);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export function isValidTimezone(timezone: string) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function getRetryDelayMinutes(attemptCount: number) {
  if (attemptCount <= 1) return 15;
  if (attemptCount === 2) return 60;
  return 180;
}
