import assert from "node:assert/strict";
import test from "node:test";
import {
  taskAssigneeFromSelectValue,
  taskAssigneeSelectValue,
} from "./taskAssigneeSelection.ts";

const assignees = [
  { pubkey: null, label: "Unassigned", kind: "unassigned" },
  { pubkey: "b2fa", label: "lu", kind: "person" },
  { pubkey: "agent-pubkey", label: "Bumble", kind: "agent" },
];

test("resolves the current user from a stable candidate index", () => {
  assert.equal(
    taskAssigneeFromSelectValue(taskAssigneeSelectValue(1), assignees),
    "b2fa",
  );
});

test("resolves an Agent from the same candidate collection", () => {
  assert.equal(
    taskAssigneeFromSelectValue(taskAssigneeSelectValue(2), assignees),
    "agent-pubkey",
  );
});

test("resolves only the explicit Unassigned candidate to null", () => {
  assert.equal(
    taskAssigneeFromSelectValue(taskAssigneeSelectValue(0), assignees),
    null,
  );
});

test("rejects stale and malformed option values", () => {
  assert.equal(taskAssigneeFromSelectValue("", assignees), undefined);
  assert.equal(
    taskAssigneeFromSelectValue(taskAssigneeSelectValue(99), assignees),
    undefined,
  );
});
