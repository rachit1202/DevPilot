/**
 * Timezone and Date Utilities for DevPilot
 * Provides reliable IANA timezone conversions, DST handling, formatting, and calendar alignment.
 */

/**
 * Error thrown when attempting to convert a local wall-clock time
 * that physically does not exist in an IANA timezone due to a DST spring-forward gap.
 */
export class NonexistentLocalTimeError extends Error {
  readonly code = 'NONEXISTENT_LOCAL_TIME';

  constructor(
    public readonly year: number,
    public readonly month: number,
    public readonly day: number,
    public readonly hour: number,
    public readonly minute: number,
    public readonly timeZone: string
  ) {
    const formatted = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    super(`NONEXISTENT_LOCAL_TIME: The local time ${formatted} does not exist in time zone ${timeZone} due to a daylight saving time transition.`);
    this.name = 'NonexistentLocalTimeError';
    Object.setPrototypeOf(this, NonexistentLocalTimeError.prototype);
  }
}

/**
 * Converts a local wall-clock date and time in an IANA time zone into an exact UTC Date.
 * 
 * Policies:
 * 1. Nonexistent times (DST spring-forward gap): Throws NonexistentLocalTimeError instead of
 *    silently converting or oscillating.
 * 2. Ambiguous times (DST fall-back overlap): Deterministically selects the first occurrence
 *    (the Daylight Saving Time / EDT instance).
 * 3. Ordinary times & non-DST zones: Accurate conversion verified back against getLocalParts.
 */
export function ianaLocalToUtc(
  year: number,
  month: number, // 1-indexed (1-12)
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone = 'UTC'
): Date {
  // Normalize date boundaries (e.g. day = 0, day = -1, or month roll-over)
  const normDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const normYear = normDate.getUTCFullYear();
  const normMonth = normDate.getUTCMonth() + 1;
  const normDay = normDate.getUTCDate();
  const normHour = normDate.getUTCHours();
  const normMinute = normDate.getUTCMinutes();
  const normSecond = normDate.getUTCSeconds();

  // Approximate starting point assuming UTC
  let d = new Date(normDate.getTime());

  // Converge using formatToParts
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    }).formatToParts(d);

    const p: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== 'literal') {
        p[part.type] = Number(part.value);
      }
    }

    const h = p.hour === 24 ? 0 : p.hour;
    const actualLocalMs = Date.UTC(p.year, p.month - 1, p.day, h, p.minute, p.second);
    const desiredLocalMs = normDate.getTime();
    const diff = desiredLocalMs - actualLocalMs;

    if (diff === 0) break;
    d = new Date(d.getTime() + diff);
  }

  // Verification step: Ensure the converged UTC instant actually formats back to the requested local time
  const verifyParts = getLocalParts(d, timeZone);
  if (
    verifyParts.year !== normYear ||
    verifyParts.month !== normMonth ||
    verifyParts.day !== normDay ||
    verifyParts.hour !== normHour ||
    verifyParts.minute !== normMinute ||
    (second !== undefined && verifyParts.second !== normSecond)
  ) {
    throw new NonexistentLocalTimeError(normYear, normMonth, normDay, normHour, normMinute, timeZone);
  }

  return d;
}

export interface LocalTimeParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
  weekdayIndex: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  weekdayShort: string; // 'Sun', 'Mon', etc.
}

export function getLocalParts(dateOrIso: Date | string, timeZone: string): LocalTimeParts {
  const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
    hour12: false,
  }).formatToParts(d);

  const p: Record<string, string> = {};
  for (const part of parts) {
    p[part.type] = part.value;
  }

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const weekdayShort = p.weekday || 'Sun';
  const hourNum = Number(p.hour);

  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: hourNum === 24 ? 0 : hourNum,
    minute: Number(p.minute),
    second: Number(p.second),
    weekdayIndex: weekdayMap[weekdayShort] ?? 0,
    weekdayShort,
  };
}

export function parseIanaDateTimeInput(dtStr: string, timeZone: string): Date {
  if (!dtStr || typeof dtStr !== 'string') {
    throw new Error('INVALID_DATE: Date-time string is required.');
  }
  const [dPart, tPart] = dtStr.split('T');
  if (!dPart) {
    throw new Error('INVALID_DATE: Invalid date-time format.');
  }
  const [y, m, d] = dPart.split('-').map(Number);
  const [hh, mm] = (tPart || '00:00').split(':').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d) || isNaN(hh) || isNaN(mm)) {
    throw new Error('INVALID_DATE: Malformed date-time values.');
  }
  return ianaLocalToUtc(y, m, d, hh, mm, 0, timeZone);
}

export function formatIanaDateStr(
  dateOrIso: Date | string,
  timeZone: string,
  format: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY' = 'YYYY-MM-DD'
): string {
  const p = getLocalParts(dateOrIso, timeZone);
  const y = String(p.year);
  const m = String(p.month).padStart(2, '0');
  const d = String(p.day).padStart(2, '0');

  switch (format) {
    case 'DD/MM/YYYY':
      return `${d}/${m}/${y}`;
    case 'MM/DD/YYYY':
      return `${m}/${d}/${y}`;
    case 'YYYY-MM-DD':
    default:
      return `${y}-${m}-${d}`;
  }
}

export function formatIanaTimeStr(
  dateOrIso: Date | string,
  timeZone: string,
  timeFormat: '12h' | '24h' = '12h'
): string {
  const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: timeFormat === '12h',
  }).format(d);
}

export function getTimezoneLabel(timeZone: string, d = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(d);
    const offsetPart = parts.find((p) => p.type === 'timeZoneName');
    const offsetStr = offsetPart ? offsetPart.value.replace('GMT', 'UTC') : '';
    return `${timeZone} (${offsetStr})`;
  } catch {
    return timeZone;
  }
}
