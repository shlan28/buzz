import assert from "node:assert/strict";
import test from "node:test";

import {
  canManageCommunityMembers,
  ensureManagedAgentRelayMembership,
  loadRelayMembershipLookup,
  shouldWarnMissingMembershipSnapshot,
} from "./relayMembers.ts";

function membershipEvent(members) {
  return {
    created_at: 1,
    tags: members.map(({ pubkey, role }) => ["member", pubkey, role]),
  };
}

test("managed agents are added before connecting to membership relays", async () => {
  const pubkey = "a".repeat(64);
  const writes = [];

  const added = await ensureManagedAgentRelayMembership(pubkey, {
    relayRequiresMembership: async () => true,
    fetchMembershipListEvent: async () => membershipEvent([]),
    addRelayMember: async (targetPubkey, role) => {
      writes.push({ targetPubkey, role });
    },
  });

  assert.equal(added, true);
  assert.deepEqual(writes, [{ targetPubkey: pubkey, role: "member" }]);
});

test("managed agents keep an existing relay role", async () => {
  const pubkey = "a".repeat(64);

  const added = await ensureManagedAgentRelayMembership(pubkey.toUpperCase(), {
    relayRequiresMembership: async () => true,
    fetchMembershipListEvent: async () =>
      membershipEvent([{ pubkey, role: "admin" }]),
    addRelayMember: async () =>
      assert.fail("existing relay members must not be rewritten"),
  });

  assert.equal(added, false);
});

test("managed agents skip NIP-43 writes on open relays", async () => {
  const added = await ensureManagedAgentRelayMembership("a".repeat(64), {
    relayRequiresMembership: async () => false,
    fetchMembershipListEvent: async () =>
      assert.fail("open relays must not request a membership snapshot"),
    addRelayMember: async () =>
      assert.fail("open relays must not receive membership writes"),
  });

  assert.equal(added, false);
});

test("managed agent relay membership failures propagate", async () => {
  const expected = new Error("actor not authorized");

  await assert.rejects(
    ensureManagedAgentRelayMembership("a".repeat(64), {
      relayRequiresMembership: async () => true,
      fetchMembershipListEvent: async () => null,
      addRelayMember: async () => {
        throw expected;
      },
    }),
    expected,
  );
});

test("open relays skip the membership snapshot request", async () => {
  const lookup = await loadRelayMembershipLookup("a".repeat(64), false, () =>
    assert.fail("open relays must not request a membership snapshot"),
  );

  assert.deepEqual(lookup, {
    snapshotFound: false,
    membershipRequired: false,
    membership: null,
  });
});

test("membership relays request their membership snapshot", async () => {
  const pubkey = "a".repeat(64);
  let requestCount = 0;
  const lookup = await loadRelayMembershipLookup(pubkey, true, async () => {
    requestCount += 1;
    return {
      created_at: 1,
      tags: [["member", pubkey, "admin"]],
    };
  });

  assert.equal(requestCount, 1);
  assert.equal(lookup.snapshotFound, true);
  assert.equal(lookup.membershipRequired, true);
  assert.equal(lookup.membership?.role, "admin");
});

test("community member management is hidden on open relays", () => {
  assert.equal(
    canManageCommunityMembers({
      snapshotFound: false,
      membershipRequired: false,
      membership: null,
    }),
    false,
  );
});

test("community member management is visible to closed-relay admins and owners", () => {
  for (const role of ["admin", "owner"]) {
    assert.equal(
      canManageCommunityMembers({
        snapshotFound: true,
        membershipRequired: true,
        membership: { pubkey: "a".repeat(64), role },
      }),
      true,
    );
  }
});

test("community member management stays hidden while loading and from closed-relay non-admins", () => {
  assert.equal(canManageCommunityMembers(undefined), false);
  assert.equal(
    canManageCommunityMembers({
      snapshotFound: true,
      membershipRequired: true,
      membership: { pubkey: "a".repeat(64), role: "member" },
    }),
    false,
  );
  assert.equal(
    canManageCommunityMembers({
      snapshotFound: true,
      membershipRequired: true,
      membership: null,
    }),
    false,
  );
});

test("missing snapshot warns when the relay requires membership", () => {
  assert.equal(
    shouldWarnMissingMembershipSnapshot({
      snapshotFound: false,
      membershipRequired: true,
      membership: null,
    }),
    true,
  );
});

test("missing snapshot is normal on an open relay", () => {
  assert.equal(
    shouldWarnMissingMembershipSnapshot({
      snapshotFound: false,
      membershipRequired: false,
      membership: null,
    }),
    false,
  );
});

test("an available snapshot never warns", () => {
  assert.equal(
    shouldWarnMissingMembershipSnapshot({
      snapshotFound: true,
      membershipRequired: true,
      membership: null,
    }),
    false,
  );
});
