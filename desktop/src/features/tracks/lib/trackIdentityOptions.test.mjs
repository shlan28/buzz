import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTrackIdentityOptions,
  unavailableTrackIdentity,
} from "./trackIdentityOptions.ts";

const member = (pubkey) => ({ pubkey });
const agent = (pubkey, name) => ({ pubkey, name });
const profile = (displayName, ownerPubkey = null) => ({
  displayName,
  avatarUrl: null,
  nip05Handle: null,
  ownerPubkey,
});

test("keeps only resolvable community identities after loading", () => {
  const options = buildTrackIdentityOptions({
    members: [
      member("VIEWER"),
      member("human"),
      member("agent"),
      member("id-only"),
    ],
    profiles: { human: profile("Human") },
    managedAgents: [agent("agent", "Builder")],
    relayAgents: [agent("outside", "Outside Agent")],
    viewerPubkey: "viewer",
    namesLoading: false,
  });

  assert.deepEqual(
    options.map(({ pubkey }) => pubkey),
    ["VIEWER", "agent", "human"],
  );
  assert.equal(options[0].label, "You");
  assert.equal(options[1].kind, "agent");
});

test("uses skeleton state while identity names are first loading", () => {
  const options = buildTrackIdentityOptions({
    members: [member("pending")],
    profiles: {},
    managedAgents: [],
    relayAgents: [],
    namesLoading: true,
  });

  assert.equal(options[0].isNameLoading, true);
  assert.equal(options[0].shortId, "pending");
});

test("keeps a confirmed unnamed profile without exposing its id as the name", () => {
  const pubkey = "1234567890abcdef";
  const options = buildTrackIdentityOptions({
    members: [member(pubkey)],
    profiles: { [pubkey]: profile(null) },
    managedAgents: [],
    relayAgents: [],
    namesLoading: false,
  });

  assert.equal(options[0].label, "Unnamed member");
  assert.equal(options[0].shortId, "12345678…cdef");
});

test("deduplicates a historical Agent profile replaced by a managed Agent", () => {
  const options = buildTrackIdentityOptions({
    members: [member("current"), member("historical")],
    profiles: {
      historical: profile("Bumble", "viewer"),
    },
    managedAgents: [agent("current", "Bumble")],
    relayAgents: [],
    viewerPubkey: "viewer",
    namesLoading: false,
  });

  assert.deepEqual(
    options.map(({ pubkey }) => pubkey),
    ["current"],
  );
});

test("labels an unavailable historical identity without exposing the full id", () => {
  const option = unavailableTrackIdentity("abcdef1234567890");

  assert.equal(option.label, "Unavailable identity");
  assert.equal(option.shortId, "abcdef12…7890");
  assert.equal(option.unavailable, true);
});
