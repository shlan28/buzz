import assert from "node:assert/strict";
import test from "node:test";

import { TASK_STATUS_PRESENTATION } from "./TaskStatusBadge.tsx";

const expectedLabels = {
  backlog: "Backlog",
  todo: "Todo",
  "in-progress": "In progress",
  blocked: "Blocked",
  done: "Done",
};

test("defines a distinct presentation for every task status", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(TASK_STATUS_PRESENTATION).map(([status, value]) => [
        status,
        value.label,
      ]),
    ),
    expectedLabels,
  );

  const classes = Object.values(TASK_STATUS_PRESENTATION).map(
    ({ className }) => className,
  );
  assert.equal(new Set(classes).size, classes.length);
});

test("keeps status colors subtle and dark-mode aware", () => {
  assert.match(TASK_STATUS_PRESENTATION.backlog.className, /bg-muted/);
  for (const status of ["todo", "in-progress", "blocked", "done"]) {
    const className = TASK_STATUS_PRESENTATION[status].className;
    assert.match(className, /\/10/);
    assert.match(className, /dark:/);
  }
});
