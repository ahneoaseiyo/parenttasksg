import test from "node:test";
import assert from "node:assert/strict";
import { combineExpressions, findDateExpressions } from "./dateParser.js";

// Reference dates: Wed 4 Nov 2026, Fri 6 Nov 2026, Sat 7 Nov 2026, Mon 2 Nov 2026
const WED = "2026-11-04", FRI = "2026-11-06", SAT = "2026-11-07", MON = "2026-11-02";
const one = (text, ref) => {
  const found = findDateExpressions(text, ref);
  assert.equal(found.length, 1, `${text} → ${JSON.stringify(found.map((f) => f.raw))}`);
  return found[0];
};
const resolved = (text, ref, expected) => {
  const e = one(text, ref);
  assert.equal(e.status, "resolved", `${text}: ${e.note}`);
  assert.deepEqual(e.dates, [expected], text);
};
const ambiguous = (text, ref, expected) => {
  const e = one(text, ref);
  assert.equal(e.status, "ambiguous", text);
  assert.deepEqual(e.dates, expected, text);
  assert.ok(e.note, "ambiguity must be explained");
  return e;
};

test("relative day words resolve from the message date, not today's date", () => {
  resolved("by tomorrow", WED, "2026-11-05");
  resolved("tmr", WED, "2026-11-05");
  resolved("due today", WED, WED);
  resolved("day after tomorrow", WED, "2026-11-06");
  resolved("tomorrow", "2026-12-31", "2027-01-01");
  resolved("tomorrow", "2028-02-28", "2028-02-29");
  resolved("tomorrow", "2026-03-31", "2026-04-01");
  assert.equal(one("yesterday", WED).dates[0], "2026-11-03");
  assert.match(one("yesterday", WED).note, /before the message date/);
});

test("weekday names resolve to the next occurrence", () => {
  resolved("on Friday", WED, FRI);
  resolved("by Monday", WED, "2026-11-09");
  resolved("Sunday", WED, "2026-11-08");
  resolved("this Friday", WED, FRI);
  resolved("this Friday", FRI, FRI);
  resolved("this Friday", SAT, "2026-11-13");
  resolved("coming Friday", WED, FRI);
  resolved("coming Friday", FRI, "2026-11-13");
  resolved("upcoming Wednesday", WED, "2026-11-11");
});

test("a weekday on the same weekday as the message is ambiguous", () => {
  ambiguous("Friday", FRI, [FRI, "2026-11-13"]);
  ambiguous("by Wednesday", WED, [WED, "2026-11-11"]);
});

test("'next <weekday>' is ambiguous inside the same week and clear across a week boundary", () => {
  ambiguous("next Friday", WED, [FRI, "2026-11-13"]);
  ambiguous("next Friday", MON, [FRI, "2026-11-13"]);
  resolved("next Friday", FRI, "2026-11-13"); // the following week is unambiguous
  resolved("next Friday", SAT, "2026-11-13");
  resolved("next Monday", SAT, "2026-11-09");
  resolved("next Monday", "2026-11-08", "2026-11-09");
});

test("'last <weekday>' is a past reference and is not treated as a deadline", () => {
  assert.deepEqual(findDateExpressions("as discussed last Friday", WED), []);
});

test("abbreviated weekdays need a capital letter so ordinary words are not dates", () => {
  assert.deepEqual(findDateExpressions("we sat down and watched the sun", WED), []);
  resolved("Fri", WED, FRI);
  resolved("Sat", WED, "2026-11-07");
});

test("durations count forward from the message date", () => {
  resolved("in 3 days", WED, "2026-11-07");
  resolved("in a week", WED, "2026-11-11");
  resolved("in two weeks", WED, "2026-11-18");
  resolved("in 3 days", "2026-12-30", "2027-01-02");
  resolved("in 1 month", "2026-01-31", "2026-02-28");
  resolved("2 weeks from now", WED, "2026-11-18");
  assert.deepEqual(findDateExpressions("in 500 days", WED), []);
});

test("periods without a day are ambiguous and never guessed", () => {
  ambiguous("by next week", WED, []);
  ambiguous("this month", WED, []);
  ambiguous("eow", WED, ["2026-11-06", "2026-11-08"]);
  ambiguous("end of week", SAT, ["2026-11-08"]);
  resolved("end of month", WED, "2026-11-30");
  resolved("EOM", "2028-02-10", "2028-02-29");
  resolved("by EOD", WED, WED);
});

test("explicit dates resolve, with a year assumed only when it is safe", () => {
  resolved("20 Nov", WED, "2026-11-20");
  resolved("20th November", WED, "2026-11-20");
  resolved("Nov 20", WED, "2026-11-20");
  resolved("4 Nov", WED, WED);
  resolved("20 Nov 2027", WED, "2027-11-20");
  resolved("2026-12-01", WED, "2026-12-01");
  resolved("1 Mar", WED, "2027-03-01"); // more than six months past → next year
  const january = one("3 Jan", WED);
  assert.equal(january.dates[0], "2027-01-03");
  assert.equal(january.level, "medium");
  assert.match(january.note, /assumed 2027/);
});

test("a recent no-year date that has already passed is flagged, not guessed", () => {
  ambiguous("3 Nov", WED, ["2026-11-03", "2027-11-03"]);
  ambiguous("1 Oct", WED, ["2026-10-01", "2027-10-01"]);
  ambiguous("1 Sept", WED, ["2026-09-01", "2027-09-01"]);
  // the six-month (183 day) boundary is exact and deterministic
  ambiguous("5 May", WED, ["2026-05-05", "2027-05-05"]); // 183 days before
  resolved("4 May", WED, "2027-05-04");                   // 184 days before
});

test("numeric dates: day-first, unambiguous US order, and genuinely ambiguous cases", () => {
  ambiguous("12/11", WED, ["2026-11-12", "2026-12-11"]);
  resolved("25/11", WED, "2026-11-25");
  resolved("11/25", WED, "2026-11-25");
  resolved("3/3", WED, "2027-03-03");
  resolved("25/11/2026", WED, "2026-11-25");
  resolved("25-11-2026", WED, "2026-11-25");
  ambiguous("03/04/2027", WED, ["2027-03-04", "2027-04-03"]);
  ambiguous("31/31", WED, []);
});

test("impossible and mismatched dates are flagged", () => {
  ambiguous("31 Feb", WED, []);
  ambiguous("31 Apr 2027", WED, []);
  const mismatch = ambiguous("Thursday 20 Nov", WED, ["2026-11-20"]);
  assert.match(mismatch.note, /Thursday.*is a Friday/);
  resolved("Fri 20 Nov", WED, "2026-11-20");
  resolved("29 Feb", WED, "2028-02-29");
  ambiguous("29 Feb 2027", WED, []);
});

test("month names are not dates without a day, and 'may' the verb is ignored", () => {
  assert.deepEqual(findDateExpressions("you may bring a hat in November", WED), []);
  assert.deepEqual(findDateExpressions("see you in May", WED), []);
  resolved("May 20", "2026-04-01", "2026-05-20");
});

test("raw expressions are exact slices of the text with correct offsets", () => {
  const text = "Please submit the form by next Friday, or on 20 Nov at the latest.";
  const found = findDateExpressions(text, WED);
  assert.equal(found.length, 2);
  for (const e of found) assert.equal(text.slice(e.start, e.end), e.raw);
  assert.deepEqual(found.map((e) => e.raw), ["next Friday", "20 Nov"]);
});

test("several expressions in one sentence are combined conservatively", () => {
  const same = combineExpressions(findDateExpressions("tomorrow, i.e. 5 Nov", WED));
  assert.equal(same.status, "resolved");
  assert.deepEqual(same.dates, ["2026-11-05"]);
  const differ = combineExpressions(findDateExpressions("by Friday or 20 Nov", WED));
  assert.equal(differ.status, "ambiguous");
  assert.deepEqual(differ.dates, ["2026-11-06", "2026-11-20"]);
  assert.match(differ.note, /Several different dates/);
  assert.deepEqual(combineExpressions([]), { status: "none", dates: [], raw: null, note: null, level: "low" });
});

test("invalid reference dates and non-strings yield nothing rather than throwing", () => {
  assert.deepEqual(findDateExpressions("tomorrow", "not-a-date"), []);
  assert.deepEqual(findDateExpressions(undefined, WED), []);
  assert.deepEqual(findDateExpressions("", WED), []);
});

test("a time-of-day phrase such as EOD adds no date when a real date is present", () => {
  const eodTomorrow = combineExpressions(findDateExpressions("reply by EOD tomorrow", WED));
  assert.deepEqual([eodTomorrow.status, eodTomorrow.dates, eodTomorrow.raw], ["resolved", ["2026-11-05"], "tomorrow"]);
  const cob = combineExpressions(findDateExpressions("send it COB Friday", WED));
  assert.deepEqual([cob.status, cob.dates], ["resolved", ["2026-11-06"]]);
  const alone = combineExpressions(findDateExpressions("send it by EOD", WED));
  assert.deepEqual([alone.status, alone.dates], ["resolved", [WED]]);
  const different = combineExpressions(findDateExpressions("EOD Friday or 20 Nov", WED));
  assert.equal(different.status, "ambiguous", "genuinely different dates are still flagged");
});
