import assert from "node:assert/strict";
import test from "node:test";
import {
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
  ],
};

test("rejects task state not signed by the Relay", () => {
  assert.equal(
    parseTaskState({ ...event, pubkey: "d".repeat(64) }, relay),
    null,
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
