import assert from "node:assert/strict";
import test from "node:test";
import {
  addLocalDays,
  dateKey,
  getCalendarRange,
  gridMinuteFromY,
  gridOffsetForDate,
  parseDateKey,
  snapMinutes,
  startOfWeek,
} from "./calendarDateMath.ts";

test("week starts Monday across month boundary", () => {
  assert.equal(dateKey(startOfWeek(new Date(2026, 7, 1))), "2026-07-27");
});

test("month range is a stable six week grid", () => {
  const range = getCalendarRange(new Date(2026, 7, 1), "month");
  assert.equal(dateKey(range.start), "2026-07-27");
  assert.equal(dateKey(range.end), "2026-09-07");
});

test("date keys reject impossible dates", () => {
  assert.equal(parseDateKey("2026-02-29"), null);
  assert.equal(dateKey(parseDateKey("2028-02-29")), "2028-02-29");
});

test("slot snapping uses quarter hours", () => {
  assert.equal(snapMinutes(22), 15);
  assert.equal(snapMinutes(23), 30);
});

test("time grid coordinates are measured from midnight", () => {
  assert.equal(gridMinuteFromY(0, 64), 0);
  assert.equal(gridMinuteFromY(7 * 64, 64), 7 * 60);
  assert.equal(gridMinuteFromY(24 * 64, 64), 24 * 60);
  assert.equal(gridOffsetForDate(new Date(2026, 7, 1, 23, 30), 64), 23.5 * 64);
});

test("local day arithmetic crosses year boundaries", () => {
  assert.equal(dateKey(addLocalDays(new Date(2026, 11, 31), 1)), "2027-01-01");
});
