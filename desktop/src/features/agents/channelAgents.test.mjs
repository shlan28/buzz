import assert from "node:assert/strict";
import test from "node:test";

import { attachManagedAgentToChannel } from "./channelAgents.ts";

const PUBKEY = "a".repeat(64);

function localAgent(overrides = {}) {
  return {
    pubkey: PUBKEY,
    status: "stopped",
    backend: { type: "local" },
    ...overrides,
  };
}

test("agent attachment grants relay access before channel access and start", async () => {
  const calls = [];
  const agent = localAgent();

  const result = await attachManagedAgentToChannel(
    "channel-id",
    { agent },
    {
      ensureRelayMembership: async (pubkey) => {
        calls.push(["relay", pubkey]);
        return true;
      },
      addChannelMembers: async (input) => {
        calls.push(["channel", input.channelId, ...input.pubkeys]);
        return { added: [PUBKEY], errors: [] };
      },
      startManagedAgent: async (pubkey) => {
        calls.push(["start", pubkey]);
        return { ...agent, status: "running" };
      },
    },
  );

  assert.deepEqual(calls, [
    ["relay", PUBKEY],
    ["channel", "channel-id", PUBKEY],
    ["start", PUBKEY],
  ]);
  assert.equal(result.membershipAdded, true);
  assert.equal(result.started, true);
  assert.equal(result.agent.status, "running");
});

test("relay membership failure stops channel attachment and start", async () => {
  const expected = new Error("actor not authorized");

  await assert.rejects(
    attachManagedAgentToChannel(
      "channel-id",
      { agent: localAgent() },
      {
        ensureRelayMembership: async () => {
          throw expected;
        },
        addChannelMembers: async () =>
          assert.fail("channel membership must not run after relay denial"),
        startManagedAgent: async () =>
          assert.fail("agent must not start after relay denial"),
      },
    ),
    expected,
  );
});
