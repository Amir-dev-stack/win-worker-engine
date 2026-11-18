/**
 * Strict RFC 3339-style timestamp validation for point-in-time data.
 * Date.parse alone normalizes impossible calendar dates (for example Feb 31),
 * which can silently move events across chronological training boundaries.
 */
export function parseStrictIsoTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] ||
      hour > 23 || minute > 59 || second > 59 ||
      (offsetHourText !== undefined &&
        (Number(offsetHourText) > 23 || Number(offsetMinuteText) > 59))) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
export function isStrictIsoTimestamp(value: unknown): value is string {
  return parseStrictIsoTimestamp(value) !== null;
}
