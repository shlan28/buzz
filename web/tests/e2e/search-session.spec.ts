import { expect, test } from "@playwright/test";
import {
  buildMessageSearchFilter,
  MAX_SEARCH_LENGTH,
  normalizeSearchQuery,
  searchLocalEntities,
} from "../../src/features/search/searchSession";
import { MESSAGE_KINDS } from "../../src/shared/domain/eventKinds";
import type { Channel } from "../../src/features/channels/types";
import type { ProfileLookup } from "../../src/features/profile/types";

const userPubkey = "11".repeat(32);
const agentPubkey = "22".repeat(32);
const channels: Channel[] = [
  {
    id: "channel-1",
    name: "engineering",
    displayName: "Engineering",
    about: "Architecture and delivery",
    channelType: "stream",
    visibility: "open",
    participantPubkeys: [userPubkey, agentPubkey],
    isMember: true,
    archivedAt: null,
    updatedAt: 1,
  },
];
const profiles: ProfileLookup = {
  [agentPubkey]: {
    pubkey: agentPubkey,
    displayName: "Hermes",
    name: "hermes",
    avatarUrl: null,
    nip05Handle: null,
    isAgent: true,
    updatedAt: 1,
  },
};

test("matches visible Channels and people without exposing unrelated profiles", () => {
  const unrelated = "33".repeat(32);
  const lookup: ProfileLookup = {
    ...profiles,
    [unrelated]: {
      ...profiles[agentPubkey],
      pubkey: unrelated,
      name: "secret",
    },
  };
  expect(
    searchLocalEntities("arch", channels, lookup, userPubkey).map(
      (result) => result.kind,
    ),
  ).toEqual(["channel"]);
  expect(
    searchLocalEntities("Hermes", channels, lookup, userPubkey).map(
      (result) => result.kind,
    ),
  ).toEqual(["person"]);
  expect(searchLocalEntities("secret", channels, lookup, userPubkey)).toEqual(
    [],
  );
});

test("normalizes and bounds Relay search input", () => {
  expect(normalizeSearchQuery("  agent   delivery  ")).toBe("agent delivery");
  expect(normalizeSearchQuery("x".repeat(MAX_SEARCH_LENGTH + 20))).toHaveLength(
    MAX_SEARCH_LENGTH,
  );
});

test("builds a bounded kind-scoped NIP-50 message filter", () => {
  expect(buildMessageSearchFilter("  architecture  ")).toEqual({
    kinds: [...MESSAGE_KINDS],
    search: "architecture",
    search_mode: "fulltext",
    page: 0,
    per_page: 30,
    limit: 30,
  });
  expect(buildMessageSearchFilter("architecture").kinds).not.toHaveLength(0);
});
