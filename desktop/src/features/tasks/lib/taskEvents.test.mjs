import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCreateTaskEvent,
  buildMutateTaskEvent,
  parseTaskHistoryEvent,
  parseTaskState,
} from "./taskEvents.ts";

const relay = "a".repeat(64);
const event = {
  id: "b".repeat(64),
  pubkey: relay,
  kind: 30500,
  content: "Description",
  created_at: 10,
  sig: "c".repeat(128),
  tags: [
    ["d", "task-id"],
    ["title", "Title"],
    ["t", "task-status:todo"],
    ["t", "task-priority:none"],
    ["due", "1785868799"],
  ],
};

test("rejects task state not signed by the Relay", () => {
  assert.equal(
    parseTaskState({ ...event, pubkey: "d".repeat(64) }, relay),
    null,
  );
});

test("parses Relay due tags as Unix seconds", () => {
  assert.equal(parseTaskState(event, relay)?.dueDate, 1785868799);
  assert.equal(
    parseTaskState(
      { ...event, tags: [...event.tags.slice(0, -1), ["due", "invalid"]] },
      relay,
    )?.dueDate,
    null,
  );
});

test("create writes a Unix-second due tag", () => {
  const command = buildCreateTaskEvent({
    id: "task-id",
    title: "Title",
    description: "",
    assignee: null,
    status: "todo",
    priority: "none",
    dueDate: 1785868799,
  });
  assert.deepEqual(
    command.tags.find((tag) => tag[0] === "due"),
    ["due", "1785868799"],
  );
});

test("mutation can modify and clear the due timestamp", () => {
  const task = parseTaskState(event, relay);
  assert.ok(task);
  const changed = buildMutateTaskEvent(task, { dueDate: 1785955199 });
  assert.deepEqual(
    changed.tags.find((tag) => tag[0] === "due"),
    ["due", "1785955199"],
  );
  const cleared = buildMutateTaskEvent(task, { dueDate: null });
  assert.deepEqual(
    cleared.tags.find((tag) => tag[0] === "clear"),
    ["clear", "due"],
  );
});

test("parses a complete command into a history entry", () => {
  const history = parseTaskHistoryEvent(
    {
      ...event,
      kind: 42501,
      pubkey: "d".repeat(64),
      tags: [
        ["t", "task-id:task-id"],
        ["p", "agent"],
        ["t", "task-status:in-progress"],
        ["clear", "due"],
      ],
    },
    "task-id",
  );
  assert.ok(history);
  assert.deepEqual(history.changes, [
    "Assignee: agent",
    "Status: in-progress",
    "Cleared: due",
  ]);
});

test("mutation carries conflict head and explicit archive change", () => {
  const task = parseTaskState(event, relay);
  assert.ok(task);
  const mutation = buildMutateTaskEvent(task, { archived: true });
  assert.deepEqual(
    mutation.tags.find((tag) => tag[0] === "previous"),
    ["previous", event.id],
  );
  assert.deepEqual(
    mutation.tags.find((tag) => tag[0] === "archived"),
    ["archived", "true"],
  );
});

test("description edit uses explicit set semantics", () => {
  const task = parseTaskState(event, relay);
  assert.ok(task);
  const mutation = buildMutateTaskEvent(task, { description: "Updated" });
  assert.equal(mutation.content, "Updated");
  assert.deepEqual(
    mutation.tags.find((tag) => tag[0] === "set"),
    ["set", "description"],
  );
});
