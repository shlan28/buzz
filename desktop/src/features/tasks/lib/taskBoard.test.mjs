import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaskColumns,
  buildTaskStatusColumns,
  filterTasks,
} from "./taskBoard.ts";

const task = (id, assignee, status = "todo") => ({
  id,
  eventId: `${id}-event`,
  title: id,
  description: "",
  assignee,
  status,
  priority: "none",
  dueDate: null,
  labels: [],
  trackId: null,
  project: null,
  channelId: null,
  creator: "creator",
  lastEditor: "editor",
  createdAt: 1,
  updatedAt: 1,
  archived: false,
});

test("orders unassigned and current user before other assignees", () => {
  const columns = buildTaskColumns(
    [task("mine", "me"), task("free", null), task("theirs", "other")],
    [
      { pubkey: "other", label: "Other", kind: "person" },
      { pubkey: null, label: "Unassigned", kind: "unassigned" },
      { pubkey: "me", label: "Me", kind: "person" },
    ],
    "me",
    true,
  );
  assert.deepEqual(
    columns.map((column) => column.pubkey),
    [null, "me", "other"],
  );
});

test("filters archived and done tasks by default", () => {
  const archived = { ...task("archived", null), archived: true };
  const result = filterTasks(
    [task("todo", null), task("done", null, "done"), archived],
    {
      query: "",
      statuses: new Set(),
      showDone: false,
      showEmptyAssignees: false,
      labels: new Set(),
      tracks: new Set(),
      projects: new Set(),
      channels: new Set(),
    },
  );
  assert.deepEqual(
    result.map((item) => item.id),
    ["todo"],
  );
});

test("builds status columns in workflow order", () => {
  const columns = buildTaskStatusColumns(
    [
      task("todo", "me", "todo"),
      task("blocked", "other", "blocked"),
      task("done", "me", "done"),
    ],
    true,
    true,
  );
  assert.deepEqual(
    columns.map((column) => column.status),
    ["backlog", "todo", "in-progress", "blocked", "done"],
  );
  assert.deepEqual(
    columns[1].tasks.map((item) => item.id),
    ["todo"],
  );
});

test("hides the done status column when done tasks are hidden", () => {
  const columns = buildTaskStatusColumns([], true, false);
  assert.equal(
    columns.some((column) => column.status === "done"),
    false,
  );
});

test("combines label, project, and channel filters", () => {
  const matching = {
    ...task("matching", null),
    labels: ["launch"],
    project: "30617:owner:roadmap",
    channelId: "planning",
  };
  const result = filterTasks([matching, task("other", null)], {
    query: "",
    statuses: new Set(),
    showDone: true,
    showEmptyAssignees: false,
    labels: new Set(["launch"]),
    tracks: new Set(),
    projects: new Set(["30617:owner:roadmap"]),
    channels: new Set(["planning"]),
  });
  assert.deepEqual(
    result.map((item) => item.id),
    ["matching"],
  );
});

test("matches any selected tag", () => {
  const desktop = { ...task("desktop", null), labels: ["desktop"] };
  const urgent = { ...task("urgent", null), labels: ["p0"] };
  const other = { ...task("other", null), labels: ["docs"] };
  const result = filterTasks([desktop, urgent, other], {
    query: "",
    statuses: new Set(),
    showDone: true,
    showEmptyAssignees: false,
    labels: new Set(["desktop", "p0"]),
    tracks: new Set(),
    projects: new Set(),
    channels: new Set(),
  });
  assert.deepEqual(
    result.map((item) => item.id),
    ["desktop", "urgent"],
  );
});
