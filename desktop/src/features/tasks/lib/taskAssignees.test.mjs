import assert from "node:assert/strict";
import test from "node:test";
import { buildTaskAssignees } from "./taskAssignees.ts";

const member = (pubkey) => ({ pubkey });
const agent = (pubkey, name, overrides = {}) => ({
  pubkey,
  name,
  taskAssignmentPolicy: "owner_only",
  taskAssignmentAllowlist: [],
  ...overrides,
});

test("excludes historical Agent profiles that are not community members", () => {
  const assignees = buildTaskAssignees({
    members: [member("human")],
    profiles: {},
    managedAgents: [],
    relayAgents: [agent("historical-agent", "Old Agent")],
    viewerPubkey: "viewer",
  });

  assert.deepEqual(
    assignees.map(({ pubkey }) => pubkey),
    [null, "human"],
  );
});

test("deduplicates the same pubkey across members and Agent sources", () => {
  const assignees = buildTaskAssignees({
    members: [member("AGENT"), member("agent")],
    profiles: {},
    managedAgents: [agent("agent", "Local Agent")],
    relayAgents: [agent("AGENT", "Relay Agent")],
    viewerPubkey: "viewer",
  });

  assert.equal(assignees.length, 2);
  assert.deepEqual(assignees[1], {
    pubkey: "AGENT",
    label: "Local Agent",
    kind: "agent",
    canAssign: true,
    unavailableReason: undefined,
  });
});

test("keeps an offline Relay Agent when it remains a community member", () => {
  const assignees = buildTaskAssignees({
    members: [member("offline-agent")],
    profiles: {
      "offline-agent": {
        displayName: "Offline Agent",
        avatarUrl: null,
        nip05Handle: null,
        ownerPubkey: "owner",
      },
    },
    managedAgents: [],
    relayAgents: [
      agent("offline-agent", "Relay Agent", {
        taskAssignmentPolicy: "anyone",
      }),
    ],
    viewerPubkey: "viewer",
  });

  assert.equal(assignees[1].kind, "agent");
  assert.equal(assignees[1].canAssign, true);
});

test("keeps human members and applies Relay Agent assignment policy", () => {
  const assignees = buildTaskAssignees({
    members: [member("human"), member("restricted-agent")],
    profiles: {},
    managedAgents: [],
    relayAgents: [agent("restricted-agent", "Restricted Agent")],
    viewerPubkey: "viewer",
  });

  assert.equal(assignees[1].kind, "person");
  assert.equal(assignees[1].canAssign, true);
  assert.equal(assignees[2].kind, "agent");
  assert.equal(assignees[2].canAssign, false);
  assert.match(assignees[2].unavailableReason, /owner/);
});
