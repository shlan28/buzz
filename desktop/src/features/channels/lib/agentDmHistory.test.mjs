import assert from "node:assert/strict";
import test from "node:test";

import {
  getAgentDmParticipant,
  normalizeHistoryKeyword,
  parseAgentDmHistoryRange,
} from "./agentDmHistory.ts";

const self = "a".repeat(64);
const agent = "b".repeat(64);

function dm(participants) {
  return {
    id: "channel",
    channelType: "dm",
    participantPubkeys: participants,
  };
}

test("recognizes only a one-to-one DM with a known agent", () => {
  assert.equal(
    getAgentDmParticipant(dm([self, agent]), self, new Set([agent])),
    agent,
  );
  assert.equal(getAgentDmParticipant(dm([self, agent]), self, new Set()), null);
  assert.equal(
    getAgentDmParticipant(
      dm([self, agent, "c".repeat(64)]),
      self,
      new Set([agent]),
    ),
    null,
  );
});

test("range includes the complete cutoff minute", () => {
  const result = parseAgentDmHistoryRange(
    "2026-07-01T09:00",
    "2026-07-03T18:30",
    new Date("2026-07-04T00:00:00"),
  );
  assert.equal(result.error, null);
  assert.equal(new Date(result.range.until * 1_000).getSeconds(), 59);
});

test("range rejects reversed and future dates", () => {
  assert.match(
    parseAgentDmHistoryRange(
      "2026-07-03T18:30",
      "2026-07-01T09:00",
      new Date("2026-07-04T00:00:00"),
    ).error,
    /开始时间/,
  );
  assert.match(
    parseAgentDmHistoryRange(
      "2026-07-01T09:00",
      "2026-07-05T09:00",
      new Date("2026-07-04T00:00:00"),
    ).error,
    /当前时间/,
  );
});

test("normalizes search whitespace", () => {
  assert.equal(normalizeHistoryKeyword("  relay   error  "), "relay error");
});
