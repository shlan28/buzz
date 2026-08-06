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
const profile = (displayName, ownerPubkey = null) => ({
  displayName,
  avatarUrl: null,
  nip05Handle: null,
  ownerPubkey,
});

test("excludes historical Agent profiles that are not community members", () => {
  const assignees = buildTaskAssignees({
    members: [member("human")],
    profiles: { human: profile("Human") },
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
    profiles: { human: profile("Human") },
    managedAgents: [agent("agent", "Local Agent")],
    relayAgents: [agent("AGENT", "Relay Agent")],
    viewerPubkey: "viewer",
  });

  assert.equal(assignees.length, 2);
  assert.deepEqual(assignees[1], {
    pubkey: "AGENT",
    label: "Local Agent",
    selectorLabel: "Local Agent",
    shortId: "AGENT",
    kind: "agent",
    isCurrent: false,
    isNameLoading: false,
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
    profiles: { human: profile("Human") },
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

test("keeps the current user assignable when stale Agent data shares their pubkey", () => {
  const assignees = buildTaskAssignees({
    members: [member("viewer")],
    profiles: {
      viewer: {
        displayName: "lu",
        avatarUrl: null,
        nip05Handle: null,
        ownerPubkey: null,
      },
    },
    managedAgents: [],
    relayAgents: [agent("viewer", "Stale agent identity")],
    viewerPubkey: "VIEWER",
  });

  assert.deepEqual(assignees[1], {
    pubkey: "viewer",
    label: "lu",
    selectorLabel: "You",
    shortId: "viewer",
    kind: "person",
    isCurrent: true,
    isNameLoading: false,
    canAssign: true,
    unavailableReason: undefined,
  });
});

test("matches the live community when an old local Agent remains only in member profiles", () => {
  const viewer = "b2fa";
  const currentBumble = "1bcf";
  const oldBumble = "d5f5";
  const assignees = buildTaskAssignees({
    members: [
      member(viewer),
      member(currentBumble),
      member(oldBumble),
      member("blank-one"),
      member("blank-two"),
    ],
    profiles: {
      [viewer]: profile("lu"),
      [currentBumble]: profile("Bumble"),
      [oldBumble]: profile("Bumble", viewer),
    },
    managedAgents: [agent(currentBumble, "Bumble")],
    relayAgents: [],
    viewerPubkey: viewer,
  });

  assert.deepEqual(
    assignees.map(({ pubkey }) => pubkey),
    [null, viewer, currentBumble],
  );
  assert.equal(assignees.filter(({ label }) => label === "Bumble").length, 1);
});

test("keeps unresolved members as skeleton rows while names first load", () => {
  const assignees = buildTaskAssignees({
    members: [member("pending-member")],
    profiles: {},
    managedAgents: [],
    relayAgents: [],
    viewerPubkey: "viewer",
    namesLoading: true,
  });

  assert.equal(assignees[1].selectorLabel, "Unnamed member");
  assert.equal(assignees[1].shortId, "pending-…mber");
  assert.equal(assignees[1].isNameLoading, true);
});

test("shows a confirmed nameless profile as Unnamed member", () => {
  const pubkey = "1234567890abcdef";
  const assignees = buildTaskAssignees({
    members: [member(pubkey)],
    profiles: { [pubkey]: profile(null) },
    managedAgents: [],
    relayAgents: [],
    viewerPubkey: "viewer",
  });

  assert.equal(assignees[1].label, "12345678…cdef");
  assert.equal(assignees[1].selectorLabel, "Unnamed member");
  assert.equal(assignees[1].shortId, "12345678…cdef");
  assert.equal(assignees[1].isNameLoading, false);
});
