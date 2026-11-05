// Calendar-date helpers. Dates are plain "YYYY-MM-DD" strings and all arithmetic is done in UTC
// so results never depend on the viewer's time zone or daylight-saving changes.
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_YEAR = 1970;
const MAX_YEAR = 2200;
const DAY_MS = 86_400_000;

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function toISO(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseISODate(value) {
  if (typeof value !== "string") return null;
  const match = ISO_PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isValidISODate(value) {
  return parseISODate(value) !== null;
}

// True when (year, month, day) is a real calendar date inside the supported range.
export function isRealDate(year, month, day) {
  return Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day) &&
    year >= MIN_YEAR && year <= MAX_YEAR && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function utcMillis(iso) {
  const { year, month, day } = parseISODate(iso);
  return Date.UTC(year, month - 1, day);
}

export function addDays(iso, days) {
  const date = new Date(utcMillis(iso) + days * DAY_MS);
  return toISO(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

// Adds calendar months, clamping to the last day of a shorter month (31 Jan + 1 month = 28/29 Feb).
export function addMonths(iso, months) {
  const { year, month, day } = parseISODate(iso);
  const index = year * 12 + (month - 1) + months;
  const newYear = Math.floor(index / 12);
  const newMonth = (index % 12) + 1;
  return toISO(newYear, newMonth, Math.min(day, daysInMonth(newYear, newMonth)));
}

export function diffDays(laterIso, earlierIso) {
  return Math.round((utcMillis(laterIso) - utcMillis(earlierIso)) / DAY_MS);
}

export function weekdayOf(iso) {
  return new Date(utcMillis(iso)).getUTCDay(); // 0 = Sunday
}

// Weeks run Monday to Sunday.
export function mondayOfWeek(iso) {
  return addDays(iso, -((weekdayOf(iso) + 6) % 7));
}

export function endOfMonth(iso) {
  const { year, month } = parseISODate(iso);
  return toISO(year, month, daysInMonth(year, month));
}

export function compareISO(a, b) {
  return a < b ? -1 : a > b ? 1 : 0; // ISO strings sort chronologically
}

// The viewer's local calendar date (not UTC), so "today" matches their wall clock.
export function todayLocalISO(now = new Date()) {
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function formatDisplayDate(iso) {
  const parts = parseISODate(iso);
  if (!parts) return "";
  return `${WEEKDAY_NAMES[weekdayOf(iso)].slice(0, 3)} ${parts.day} ${MONTH_NAMES[parts.month - 1].slice(0, 3)} ${parts.year}`;
}
