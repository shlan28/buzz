import assert from "node:assert/strict";
import test from "node:test";
import {
  dueTimestampToLocalDate,
  isDueTimestampOverdue,
  localDateToDueTimestamp,
} from "./taskDates.ts";

test("converts a local date to the final second of that day", () => {
  const timestamp = localDateToDueTimestamp("2026-08-04");
  assert.equal(
    timestamp,
    Math.floor(new Date(2026, 7, 4, 23, 59, 59).getTime() / 1000),
  );
  assert.equal(dueTimestampToLocalDate(timestamp), "2026-08-04");
});

test("rejects empty and invalid local dates", () => {
  assert.equal(localDateToDueTimestamp(""), null);
  assert.equal(localDateToDueTimestamp("2026-02-30"), null);
  assert.equal(dueTimestampToLocalDate(null), "");
});

test("keeps timezone-boundary dates in local calendar time", () => {
  const timestamp = localDateToDueTimestamp("2026-01-01");
  assert.equal(dueTimestampToLocalDate(timestamp), "2026-01-01");
});

test("becomes overdue only after the final second of the due date", () => {
  const due = localDateToDueTimestamp("2026-08-04");
  assert.ok(due);
  assert.equal(isDueTimestampOverdue(due, due), false);
  assert.equal(isDueTimestampOverdue(due, due + 1), true);
});
