import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays, addMonths, daysInMonth, diffDays, endOfMonth, formatDisplayDate, isValidISODate, mondayOfWeek, parseISODate, todayLocalISO, weekdayOf,
} from "./dates.js";

test("ISO validation accepts real dates only", () => {
  for (const ok of ["2026-11-05", "2028-02-29", "2000-02-29", "1970-01-01"]) assert.equal(isValidISODate(ok), true, ok);
  for (const bad of ["2026-02-29", "2100-02-29", "2026-13-01", "2026-00-10", "2026-11-31", "26-11-05", "2026-1-5", "2026-11-05T00:00", "", null, 20261105, undefined, "1969-12-31"]) {
    assert.equal(isValidISODate(bad), false, String(bad));
  }
  assert.deepEqual(parseISODate("2026-11-05"), { year: 2026, month: 11, day: 5 });
});

test("day arithmetic crosses month, year and leap-day boundaries", () => {
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2027-02-28", 1), "2027-03-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2026-11-05", 0), "2026-11-05");
  assert.equal(diffDays("2026-11-10", "2026-11-05"), 5);
  assert.equal(diffDays("2026-11-05", "2026-11-10"), -5);
  assert.equal(diffDays("2027-03-01", "2027-02-28"), 1);
});

test("month arithmetic clamps to the end of shorter months", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonths("2026-11-15", 3), "2027-02-15");
  assert.equal(addMonths("2026-12-31", 2), "2027-02-28");
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(endOfMonth("2026-11-05"), "2026-11-30");
});

test("weekdays and week starts are correct (weeks run Monday to Sunday)", () => {
  assert.equal(weekdayOf("2026-11-05"), 4); // Thursday
  assert.equal(weekdayOf("2026-11-08"), 0); // Sunday
  assert.equal(mondayOfWeek("2026-11-05"), "2026-11-02");
  assert.equal(mondayOfWeek("2026-11-08"), "2026-11-02");
  assert.equal(mondayOfWeek("2026-11-09"), "2026-11-09");
  assert.equal(formatDisplayDate("2026-11-05"), "Thu 5 Nov 2026");
  assert.equal(formatDisplayDate("nope"), "");
});

test("today comes from the local calendar date, not UTC", () => {
  assert.equal(todayLocalISO(new Date(2026, 10, 5, 0, 30)), "2026-11-05");
  assert.equal(todayLocalISO(new Date(2026, 10, 5, 23, 59)), "2026-11-05");
  assert.equal(todayLocalISO(new Date(2027, 0, 1, 0, 0)), "2027-01-01");
});
