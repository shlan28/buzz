import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTaskExecutionInboxItems,
  isTaskExecutionInboxItem,
  latestTaskExecutionStates,
  taskIdFromExecutionInboxItem,
} from "./taskExecutionInbox.ts";

const OWNER = "a".repeat(64);
const AGENT = "b".repeat(64);
const OTHER = "c".repeat(64);

function task(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    eventId: "d".repeat(64),
    title: "Prepare investor plan",
    description: "Build a 14-day plan",
    assignee: AGENT,
    status: "in-progress",
    priority: "high",
    dueDate: 1_786_032_000,
    labels: [],
    project: null,
    channelId: null,
    creator: OWNER,
    lastEditor: OWNER,
    createdAt: 1,
    updatedAt: 2,
    archived: false,
    ...overrides,
  };
}

function execution(overrides = {}) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    eventId: "e".repeat(64),
    taskId: task().id,
    assignee: AGENT,
    owner: OWNER,
    requester: OWNER,
    status: "finished",
    message: "Completed with a prioritized outreach list.",
    updatedAt: 1_786_000_000,
    ...overrides,
  };
}

test("builds a terminal task result with task context for the requester", () => {
  const [item] = buildTaskExecutionInboxItems({
    currentPubkey: OWNER,
    executions: [execution()],
    ownedAgentPubkeys: new Set([AGENT]),
    tasks: [task()],
  });

  assert.equal(item.content, "Completed with a prioritized outreach list.");
  assert.equal(item.pubkey, AGENT);
  assert.equal(item.category, "agent_activity");
  assert.equal(isTaskExecutionInboxItem(item), true);
  assert.equal(taskIdFromExecutionInboxItem(item), task().id);
  assert.deepEqual(
    item.tags.find((tag) => tag[0] === "task-title"),
    ["task-title", "Prepare investor plan"],
  );
  assert.deepEqual(
    item.tags.find((tag) => tag[0] === "task-priority"),
    ["task-priority", "high"],
  );
  assert.deepEqual(
    item.tags.find((tag) => tag[0] === "task-description"),
    ["task-description", "Build a 14-day plan"],
  );
});

test("hides queued and running executions", () => {
  const items = buildTaskExecutionInboxItems({
    currentPubkey: OWNER,
    executions: [
      execution({ status: "queued" }),
      execution({ status: "running" }),
    ],
    ownedAgentPubkeys: new Set([AGENT]),
    tasks: [task()],
  });
  assert.deepEqual(items, []);
});

test("shows an Agent-started execution to its owner", () => {
  const items = buildTaskExecutionInboxItems({
    currentPubkey: OWNER,
    executions: [execution({ requester: AGENT })],
    ownedAgentPubkeys: new Set(),
    tasks: [task()],
  });
  assert.equal(items.length, 1);
});

test("does not expose another member's task execution", () => {
  const items = buildTaskExecutionInboxItems({
    currentPubkey: OTHER,
    executions: [execution()],
    ownedAgentPubkeys: new Set(),
    tasks: [task()],
  });
  assert.deepEqual(items, []);
});

test("hides results whose task state is no longer available", () => {
  const items = buildTaskExecutionInboxItems({
    currentPubkey: OWNER,
    executions: [execution()],
    ownedAgentPubkeys: new Set([AGENT]),
    tasks: [],
  });
  assert.deepEqual(items, []);
});

test("keeps separate Inbox results for multiple executions of one task", () => {
  const items = buildTaskExecutionInboxItems({
    currentPubkey: OWNER,
    executions: [
      execution(),
      execution({
        id: "33333333-3333-4333-8333-333333333333",
        eventId: "f".repeat(64),
        message: "Completed a second pass with updated priorities.",
        updatedAt: 1_786_000_100,
      }),
    ],
    ownedAgentPubkeys: new Set([AGENT]),
    tasks: [task()],
  });

  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((item) => item.tags.find((tag) => tag[0] === "d")?.[1]),
    [
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ],
  );
  assert.notEqual(items[0].id, items[1].id);
});

test("keeps terminal history when later executions are cancelled or refreshed", () => {
  const firstFinished = execution();
  const cancelled = execution({
    id: "33333333-3333-4333-8333-333333333333",
    eventId: "f".repeat(64),
    status: "cancelled",
    message: "Cancelled by user",
    updatedAt: 1_786_000_100,
  });
  const latestId = "44444444-4444-4444-8444-444444444444";
  const latest = latestTaskExecutionStates([
    firstFinished,
    cancelled,
    execution({
      id: latestId,
      eventId: "1".repeat(64),
      status: "running",
      message: "",
      updatedAt: 1_786_000_200,
    }),
    execution({
      id: latestId,
      eventId: "2".repeat(64),
      status: "finished",
      message: "Completed the refreshed pass.",
      updatedAt: 1_786_000_300,
    }),
  ]);
  const items = buildTaskExecutionInboxItems({
    currentPubkey: OWNER,
    executions: latest,
    ownedAgentPubkeys: new Set([AGENT]),
    tasks: [task()],
  });

  assert.deepEqual(
    items.map((item) => item.tags.find((tag) => tag[0] === "d")?.[1]),
    [firstFinished.id, latestId],
  );
  assert.deepEqual(
    items.map((item) => item.content),
    [firstFinished.message, "Completed the refreshed pass."],
  );
});
