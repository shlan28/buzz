import assert from "node:assert/strict";
import test from "node:test";
import { taskAssigneeFromSelectValue } from "./taskAssigneeSelection.ts";

test("preserves the current user's pubkey", () => {
  const pubkey =
    "b2fa0399d5e1487ee90b88e0d18223fb17e382d711aaee0e7f0ad5ee7d363f4e";
  assert.equal(taskAssigneeFromSelectValue(pubkey), pubkey);
});

test("preserves any other non-empty assignee value", () => {
  assert.equal(taskAssigneeFromSelectValue("agent-pubkey"), "agent-pubkey");
});

test("only an explicit empty value clears the assignee", () => {
  assert.equal(taskAssigneeFromSelectValue(""), null);
});
