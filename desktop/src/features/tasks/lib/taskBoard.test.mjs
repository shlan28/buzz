import assert from "node:assert/strict";
import test from "node:test";
import { buildTaskColumns, filterTasks } from "./taskBoard.ts";

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
    },
  );
  assert.deepEqual(
    result.map((item) => item.id),
    ["todo"],
  );
});
