import assert from "node:assert/strict";
import test from "node:test";
import {
  expandCalendarDraft,
  validateRecurrence,
} from "./calendarRecurrence.ts";

function draft(start, recurrence) {
  return {
    id: "series",
    title: "Planning",
    description: "",
    location: "",
    participants: [],
    calendarId: "personal",
    start,
    end: new Date(start.getTime() + 30 * 60_000),
    allDay: false,
    recurrence,
  };
}

test("custom weekdays expand in stable order", () => {
  const events = expandCalendarDraft(
    draft(new Date(2026, 7, 3, 9), {
      kind: "weekdays",
      values: [5, 1, 3, 1],
      end: { kind: "count", count: 4 },
    }),
  );
  assert.deepEqual(
    events.map((event) => event.start.getDay()),
    [1, 3, 5, 1],
  );
  assert.deepEqual(events[0].series.values, [1, 3, 5]);
});

test("month dates skip days absent from a month", () => {
  const events = expandCalendarDraft(
    draft(new Date(2027, 0, 31, 9), {
      kind: "month-days",
      values: [31],
      end: { kind: "count", count: 3 },
    }),
  );
  assert.deepEqual(
    events.map((event) => [event.start.getMonth() + 1, event.start.getDate()]),
    [
      [1, 31],
      [3, 31],
      [5, 31],
    ],
  );
});

test("until is inclusive and ids are retry-stable", () => {
  const value = draft(new Date(2026, 7, 1, 9), {
    kind: "daily",
    values: [],
    end: { kind: "until", date: "2026-08-03" },
  });
  const first = expandCalendarDraft(value);
  const retry = expandCalendarDraft(value);
  assert.deepEqual(
    first.map((event) => event.id),
    retry.map((event) => event.id),
  );
  assert.equal(first.length, 3);
});

test("rule must include first date", () => {
  assert.match(
    validateRecurrence(new Date(2026, 7, 3), {
      kind: "weekdays",
      values: [2],
      end: { kind: "count", count: 2 },
    }),
    /first event date/,
  );
});
