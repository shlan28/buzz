import assert from "node:assert/strict";
import test from "node:test";
import {
  assertTaskAssigneeTags,
  buildCreateTaskEvent,
  buildDeleteTaskEvent,
  buildExecuteTaskEvent,
  buildMutateTaskEvent,
  parseTaskHistoryEvent,
  parseTaskExecutionState,
  parseTaskState,
  taskIdFromDeleteEvent,
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

test("builds a version-bound Agent execution request", () => {
  const task = parseTaskState(
    { ...event, tags: [...event.tags, ["p", "d".repeat(64)]] },
    relay,
  );
  assert.ok(task);
  const execution = buildExecuteTaskEvent(task);
  assert.equal(execution.kind, 42503);
  assert.deepEqual(
    execution.tags.find((tag) => tag[0] === "previous"),
    ["previous", event.id],
  );
  assert.deepEqual(
    execution.tags.find((tag) => tag[0] === "p"),
    ["p", "d".repeat(64), "", "agent"],
  );
  assert.match(
    execution.tags.find((tag) => tag[0] === "d")?.[1] ?? "",
    /^[0-9a-f-]{36}$/,
  );
});

test("parses only Relay-signed execution state", () => {
  const execution = {
    ...event,
    kind: 30501,
    content: "",
    tags: [
      ["d", "00000000-0000-4000-8000-000000000001"],
      ["t", "task-id:task-id"],
      ["p", "d".repeat(64), "", "agent"],
      ["requester", "e".repeat(64)],
      ["status", "running"],
    ],
  };
  assert.equal(parseTaskExecutionState(execution, relay)?.status, "running");
  assert.equal(
    parseTaskExecutionState({ ...execution, pubkey: "f".repeat(64) }, relay),
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

test("mutation writes the selected user's pubkey and explicit clear separately", () => {
  const task = parseTaskState(event, relay);
  assert.ok(task);
  const lu = "b2fa0399d5e1487ee90b88e0d18223fb17e382d711aaee0e7f0ad5ee7d363f4e";
  const assigned = buildMutateTaskEvent(task, { assignee: lu });
  assert.deepEqual(
    assigned.tags.find((tag) => tag[0] === "p"),
    ["p", lu],
  );
  assert.equal(
    assigned.tags.some((tag) => tag[0] === "clear"),
    false,
  );

  const cleared = buildMutateTaskEvent(task, { assignee: null });
  assert.deepEqual(
    cleared.tags.find((tag) => tag[0] === "clear"),
    ["clear", "assignee"],
  );
});

test("rejects a mutation without any changed field", () => {
  const task = parseTaskState(event, relay);
  assert.ok(task);
  assert.throws(
    () => buildMutateTaskEvent(task, {}),
    /does not contain any changes/,
  );
});

test("rejects an assignee command when signing loses the selected user", () => {
  const lu = "b2fa0399d5e1487ee90b88e0d18223fb17e382d711aaee0e7f0ad5ee7d363f4e";
  assert.doesNotThrow(() => assertTaskAssigneeTags([["p", lu]], lu));
  assert.doesNotThrow(() =>
    assertTaskAssigneeTags([["clear", "assignee"]], null),
  );
  assert.throws(
    () => assertTaskAssigneeTags([["action", "update"]], lu),
    /lost before publishing/,
  );
  assert.throws(
    () => assertTaskAssigneeTags([["action", "update"]], null),
    /lost before publishing/,
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

test("delete carries only the task id and latest state reference", () => {
  const task = parseTaskState(event, relay);
  assert.ok(task);
  const deletion = buildDeleteTaskEvent(task);
  assert.equal(deletion.kind, 42502);
  assert.equal(deletion.content, "");
  assert.deepEqual(deletion.tags, [
    ["t", "task-id:task-id"],
    ["previous", event.id],
    ["e", event.id, "", "previous"],
  ]);
});

test("accepts only well-formed task delete markers", () => {
  const task = parseTaskState(event, relay);
  assert.ok(task);
  const deletion = { ...buildDeleteTaskEvent(task), ...event, kind: 42502 };
  deletion.content = "";
  deletion.tags = buildDeleteTaskEvent(task).tags;
  assert.equal(taskIdFromDeleteEvent(deletion), "task-id");
  assert.equal(
    taskIdFromDeleteEvent({ ...deletion, tags: deletion.tags.slice(0, 2) }),
    null,
  );
  assert.equal(taskIdFromDeleteEvent({ ...deletion, content: "Title" }), null);
});
