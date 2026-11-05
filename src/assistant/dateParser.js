import {
  MONTH_NAMES, WEEKDAY_NAMES, addDays, addMonths, compareISO, diffDays, endOfMonth, isRealDate, mondayOfWeek,
  parseISODate, toISO, weekdayOf,
} from "./dates.js";

// Finds date expressions in free text and resolves them against a reference ("message") date.
// A result is either "resolved" (exactly one date) or "ambiguous" (zero or several candidate dates).
// Nothing is guessed: if more than one reading is plausible the expression is returned as ambiguous.

const MONTH = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const WEEKDAY = "mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?";
const NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const STALE_YEAR_DAYS = 183; // a no-year date this far in the past is read as next year, not flagged

const monthIndex = (token) => ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(token.slice(0, 3).toLowerCase()) + 1;
const weekdayIndex = (token) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(token.slice(0, 3).toLowerCase());
// Short weekday forms ("sat", "sun") are only treated as dates when capitalised, to avoid "sat down" / "the sun".
const weekdayTokenOk = (token) => token.length > 4 || /^[A-Z]/.test(token);

const shortDate = (iso) => { const p = parseISODate(iso); return `${p.day} ${MONTH_NAMES[p.month - 1].slice(0, 3)} ${p.year}`; };
const unique = (list) => [...new Set(list)].sort(compareISO);

const PATTERNS = [
  { kind: "iso", regex: new RegExp(String.raw`\b(\d{4})-(\d{2})-(\d{2})\b`, "g") },
  { kind: "dayMonth", regex: new RegExp(String.raw`(?:\b(${WEEKDAY})\.?,?\s+)?\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(${MONTH})\b(?:,?\s+(\d{4})(?!\d))?`, "gi") },
  { kind: "monthDay", regex: new RegExp(String.raw`(?:\b(${WEEKDAY})\.?,?\s+)?\b(${MONTH})\b\.?\s+(\d{1,2})(?!\d)(?:st|nd|rd|th)?(?:,?\s+(\d{4})(?!\d))?`, "gi") },
  { kind: "numeric", regex: new RegExp(String.raw`\b(\d{1,2})/(\d{1,2})(?:/(\d{4}|\d{2}))?(?![\d/])`, "g") },
  { kind: "numericDash", regex: new RegExp(String.raw`\b(\d{1,2})-(\d{1,2})-(\d{4})\b`, "g") },
  { kind: "dayWord", regex: /\b(day after tomorrow|tomorrow|tmrw|tmr|today|tonight|yesterday)\b/gi },
  { kind: "inN", regex: new RegExp(String.raw`\b(?:in\s+)?(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,3})\s+(day|week|month)s?\s*(?:from\s+(?:now|today)|time)?`, "gi") },
  { kind: "span", regex: /\b(end of (?:the |this )?(?:week|month)|end of next week|next week|this week|next month|this month|eow|eom|eod|end of day|cob|close of business)\b/gi },
  { kind: "weekday", regex: new RegExp(String.raw`\b(?:(this|next|coming|upcoming|last)\s+)?(${WEEKDAY})\b`, "gi") },
];

// ── Resolution helpers ───────────────────────────────────────────────────────

function resolveYearless(month, day, ref) {
  const refYear = parseISODate(ref).year;
  const options = (year) => (isRealDate(year, month, day) ? toISO(year, month, day) : null);
  const thisYear = options(refYear);
  let nextYear = null; // 29 Feb falls forward to the next leap year
  for (let year = refYear + 1; year <= refYear + 8 && !nextYear; year += 1) nextYear = options(year);
  if (thisYear && compareISO(thisYear, ref) >= 0) return { dates: [thisYear], assumed: false };
  if (thisYear && diffDays(ref, thisYear) <= STALE_YEAR_DAYS) {
    return { dates: unique([thisYear, nextYear].filter(Boolean)), assumed: false, ambiguousYear: true };
  }
  return { dates: nextYear ? [nextYear] : [], assumed: true };
}

function explicitOrYearless(month, day, year, ref) {
  if (year) {
    if (!isRealDate(year, month, day)) return { dates: [], invalid: true };
    return { dates: [toISO(year, month, day)] };
  }
  if (!isRealDate(2000, month, day) && !(month === 2 && day === 29)) return { dates: [], invalid: true };
  return resolveYearless(month, day, ref);
}

function describe(result, base) {
  const out = { ...base };
  if (result.invalid) {
    return { ...out, status: "ambiguous", dates: [], level: "high", note: "This is not a valid calendar date." };
  }
  if (result.ambiguousYear) {
    return { ...out, status: "ambiguous", dates: result.dates, level: "high",
      note: `No year was given and ${result.dates.map(shortDate).join(" / ")} are both possible.` };
  }
  if (result.dates.length === 1) {
    const [date] = result.dates;
    if (result.assumed) return { ...out, status: "resolved", dates: [date], level: "medium", note: `No year was given; assumed ${parseISODate(date).year}.` };
    return { ...out, status: "resolved", dates: [date], level: "low", note: out.note ?? null };
  }
  return { ...out, status: "ambiguous", dates: unique(result.dates), level: "high", note: out.note ?? "More than one date is possible." };
}

function checkWeekday(resolved, weekdayToken, ref) {
  if (resolved.status !== "resolved" || !weekdayToken || !weekdayTokenOk(weekdayToken)) return resolved;
  const [date] = resolved.dates;
  if (weekdayOf(date) === weekdayIndex(weekdayToken)) return resolved;
  return { ...resolved, status: "ambiguous", level: "high",
    note: `The message says ${WEEKDAY_NAMES[weekdayIndex(weekdayToken)]}, but ${shortDate(date)} is a ${WEEKDAY_NAMES[weekdayOf(date)]}.` };
}

function resolveWeekday(modifier, token, ref) {
  const target = weekdayIndex(token);
  const delta = (target - weekdayOf(ref) + 7) % 7;
  const mod = modifier ? modifier.toLowerCase() : "";
  if (mod === "this") return { status: "resolved", dates: [addDays(ref, delta)], level: "low", note: delta === 0 ? "Interpreted as today." : null };
  if (mod === "coming" || mod === "upcoming") return { status: "resolved", dates: [addDays(ref, delta === 0 ? 7 : delta)], level: "low", note: null };
  if (mod === "next") {
    const coming = addDays(ref, delta === 0 ? 7 : delta);
    if (compareISO(mondayOfWeek(coming), mondayOfWeek(ref)) > 0) return { status: "resolved", dates: [coming], level: "low", note: null };
    return { status: "ambiguous", dates: unique([coming, addDays(coming, 7)]), level: "high",
      note: "“Next” could mean the coming one or the one in the following week." };
  }
  if (delta === 0) {
    return { status: "ambiguous", dates: unique([ref, addDays(ref, 7)]), level: "high",
      note: `The message is dated on a ${WEEKDAY_NAMES[target]}; it could mean that day or the following week.` };
  }
  return { status: "resolved", dates: [addDays(ref, delta)], level: "low", note: null };
}

function resolveSpan(phrase, ref) {
  const p = phrase.toLowerCase();
  if (p === "eod" || p === "end of day" || p === "cob" || p === "close of business") {
    return { status: "resolved", dates: [ref], level: "low", note: "End of day on the message date.", timeOnly: true };
  }
  if (/month/.test(p) && /^(end of|eom)/.test(p)) return { status: "resolved", dates: [endOfMonth(ref)], level: "low", note: null };
  if (p === "eom") return { status: "resolved", dates: [endOfMonth(ref)], level: "low", note: null };
  if (p === "eow" || p === "end of week" || p === "end of this week" || p === "end of the week") {
    const monday = mondayOfWeek(ref);
    const dates = [addDays(monday, 4), addDays(monday, 6)].filter((d) => compareISO(d, ref) >= 0);
    return { status: "ambiguous", dates, level: "high", note: "“End of week” could mean Friday or Sunday." };
  }
  if (p === "end of next week") {
    const monday = addDays(mondayOfWeek(ref), 7);
    return { status: "ambiguous", dates: [addDays(monday, 4), addDays(monday, 6)], level: "high", note: "“End of week” could mean Friday or Sunday." };
  }
  return { status: "ambiguous", dates: [], level: "high", note: "A period was given, not a specific day." };
}

function resolveDayWord(word, ref) {
  const w = word.toLowerCase();
  if (w === "today" || w === "tonight") return { status: "resolved", dates: [ref], level: "low", note: null };
  if (w === "yesterday") return { status: "resolved", dates: [addDays(ref, -1)], level: "low", note: "This date is before the message date." };
  if (w === "day after tomorrow") return { status: "resolved", dates: [addDays(ref, 2)], level: "low", note: null };
  return { status: "resolved", dates: [addDays(ref, 1)], level: "low", note: null };
}

function resolveMatch(kind, m, ref) {
  if (kind === "iso") {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isRealDate(y, mo, d) ? { status: "resolved", dates: [toISO(y, mo, d)], level: "low", note: null }
      : { status: "ambiguous", dates: [], level: "high", note: "This is not a valid calendar date." };
  }
  if (kind === "dayMonth" || kind === "monthDay") {
    const weekday = m[1];
    const [day, month] = kind === "dayMonth" ? [Number(m[2]), monthIndex(m[3])] : [Number(m[3]), monthIndex(m[2])];
    const year = m[4] ? Number(m[4]) : null;
    return checkWeekday(describe(explicitOrYearless(month, day, year, ref), {}), weekday, ref);
  }
  if (kind === "numeric" || kind === "numericDash") {
    const [a, b] = [Number(m[1]), Number(m[2])];
    const rawYear = m[3] ? Number(m[3]) : null;
    const year = rawYear === null ? null : rawYear < 100 ? 2000 + rawYear : rawYear;
    const readings = [];
    if (b >= 1 && b <= 12) readings.push({ day: a, month: b });          // day/month (Singapore, UK)
    if (a >= 1 && a <= 12 && a !== b) readings.push({ day: b, month: a }); // month/day (US)
    const valid = readings.filter((r) => explicitOrYearless(r.month, r.day, year, ref).invalid !== true);
    if (valid.length === 0) return { status: "ambiguous", dates: [], level: "high", note: "This is not a valid calendar date." };
    const results = valid.map((r) => explicitOrYearless(r.month, r.day, year, ref));
    if (valid.length === 1) {
      const only = describe(results[0], {});
      if (readings.length === 2 || a > 12 || b <= 12) return only;
      return { ...only, note: only.note ?? `Read as month/day because ${a} is not a valid month.` };
    }
    const dates = unique(results.flatMap((r) => r.dates));
    return { status: "ambiguous", dates, level: "high",
      note: `${m[1]}/${m[2]} can be read as day/month or month/day: ${dates.map(shortDate).join(" or ")}.` };
  }
  if (kind === "dayWord") return resolveDayWord(m[1], ref);
  if (kind === "inN") {
    const amount = NUMBER_WORDS[m[1].toLowerCase()] ?? Number(m[1]);
    const unit = m[2].toLowerCase();
    if (!Number.isInteger(amount) || amount < 1 || amount > 120) return null;
    const date = unit === "day" ? addDays(ref, amount) : unit === "week" ? addDays(ref, amount * 7) : addMonths(ref, amount);
    return { status: "resolved", dates: [date], level: "low", note: unit === "month" ? "Calendar months, clamped to the last day of a shorter month." : null };
  }
  if (kind === "span") return resolveSpan(m[1], ref);
  if (kind === "weekday") {
    const [modifier, token] = [m[1], m[2]];
    if (!weekdayTokenOk(token)) return null;
    if (modifier && modifier.toLowerCase() === "last") return null; // a past reference, not a deadline
    return resolveWeekday(modifier, token, ref);
  }
  return null;
}

/**
 * @param {string} text
 * @param {string} referenceDate  ISO date the relative expressions are measured from
 * @returns {{raw:string,start:number,end:number,status:"resolved"|"ambiguous",dates:string[],level:"low"|"medium"|"high",note:string|null}[]}
 */
export function findDateExpressions(text, referenceDate) {
  if (typeof text !== "string" || !parseISODate(referenceDate)) return [];
  const candidates = [];
  for (const { kind, regex } of PATTERNS) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match[0].length === 0) { regex.lastIndex += 1; continue; }
      const resolved = resolveMatch(kind, match, referenceDate);
      if (resolved) candidates.push({ raw: match[0], start: match.index, end: match.index + match[0].length, ...resolved });
    }
  }
  candidates.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const accepted = [];
  let lastEnd = -1;
  for (const candidate of candidates) {
    if (candidate.start >= lastEnd) { accepted.push(candidate); lastEnd = candidate.end; }
  }
  return accepted.map((e) => ({ ...e, raw: e.raw.replace(/\s+$/, ""), end: e.start + e.raw.replace(/\s+$/, "").length }));
}

// Collapses several expressions found in one sentence into a single deadline decision.
export function combineExpressions(all) {
  // "EOD tomorrow" is one deadline: a bare time-of-day phrase adds no date when a real date is present.
  const dated = all.filter((e) => !e.timeOnly);
  const expressions = dated.length > 0 ? dated : all;
  if (expressions.length === 0) return { status: "none", dates: [], raw: null, note: null, level: "low" };
  if (expressions.length === 1) {
    const [e] = expressions;
    return { status: e.status, dates: e.dates, raw: e.raw, note: e.note, level: e.level };
  }
  const raw = expressions.map((e) => e.raw).join(" / ");
  const allResolved = expressions.every((e) => e.status === "resolved");
  const dates = unique(expressions.flatMap((e) => e.dates));
  if (allResolved && dates.length === 1) return { status: "resolved", dates, raw, note: "The same date is mentioned more than once.", level: "low" };
  return { status: "ambiguous", dates, raw, note: "Several different dates are mentioned.", level: "high" };
}
