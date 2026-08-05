import assert from "node:assert/strict";
import test from "node:test";
import { resolveTaskAssigneeCandidate } from "./taskAssigneeSelection.ts";

const assignees = [
  { pubkey: null, label: "Unassigned", kind: "unassigned" },
  { pubkey: "b2fa", label: "lu", kind: "person" },
  { pubkey: "agent-pubkey", label: "Bumble", kind: "agent" },
];

test("resolves the current user from the clicked candidate", () => {
  assert.equal(resolveTaskAssigneeCandidate("B2FA", assignees), "b2fa");
});

test("resolves an Agent from the same candidate collection", () => {
  assert.equal(
    resolveTaskAssigneeCandidate("agent-pubkey", assignees),
    "agent-pubkey",
  );
});

test("resolves only the explicit Unassigned candidate to null", () => {
  assert.equal(resolveTaskAssigneeCandidate(null, assignees), null);
});

test("rejects a candidate that is no longer available", () => {
  assert.equal(resolveTaskAssigneeCandidate("stale", assignees), undefined);
});
