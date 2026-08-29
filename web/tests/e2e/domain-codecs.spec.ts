import { expect, test } from "@playwright/test";
import { parseCalendarItem } from "../../src/features/calendar/eventCodec";
import {
  parseChannel,
  parseMessage,
} from "../../src/features/channels/eventCodec";
import { parseTask } from "../../src/features/tasks/eventCodec";
import { parseTrack } from "../../src/features/tracks/eventCodec";
import { latestByCoordinate } from "../../src/shared/domain/eventTags";
import {
  buildProfileLookup,
  parseProfile,
  profileLabel,
} from "../../src/features/profile/eventCodec";
import { channelDisplayName } from "../../src/features/channels/channelLabels";
import type { NostrEvent } from "../../src/shared/lib/nostr-client";
import { sortMessagesForTimeline } from "../../src/shared/api/communitySession";

function event(
  kind: number,
  tags: string[][],
  content = "",
  createdAt = 100,
): NostrEvent {
  return {
    id: `${kind}-${createdAt}`,
    pubkey: "aa".repeat(32),
    sig: "bb".repeat(64),
    kind,
    tags,
    content,
    created_at: createdAt,
  };
}

test("parses channel and scoped messages while rejecting missing scope", () => {
  expect(
    parseChannel(
      event(39_000, [
        ["d", "general"],
        ["name", "General"],
      ]),
    )?.name,
  ).toBe("General");
  expect(parseChannel(event(39_000, [["d", "general"]]))).toBeNull();
  expect(parseMessage(event(9, [["h", "general"]], "Hello"))).toMatchObject({
    content: "Hello",
    kind: 9,
    tags: [["h", "general"]],
  });
  expect(parseMessage(event(9, [], "leak"))).toBeNull();
});

test("resolves current-user and generic DM labels from latest profiles", () => {
  const user = "11".repeat(32);
  const agent = "22".repeat(32);
  const profiles = buildProfileLookup([
    {
      ...event(0, [], JSON.stringify({ display_name: "Old Hermes" }), 90),
      pubkey: agent,
    },
    {
      ...event(
        0,
        [["auth", user, "sig", "relay"]],
        JSON.stringify({ display_name: "Hermes", name: "hermes" }),
        100,
      ),
      pubkey: agent,
    },
  ]);
  expect(parseProfile({ ...event(0, [], "{}"), pubkey: user })).not.toBeNull();
  expect(profileLabel(profiles[agent], agent)).toBe("Hermes");
  const dm = parseChannel(
    event(39_000, [
      ["d", "11111111-1111-4111-8111-111111111111"],
      ["name", "dm"],
      ["t", "dm"],
      ["p", user],
      ["p", agent],
    ]),
  );
  expect(dm && channelDisplayName(dm, user, profiles)).toBe("Hermes");
  expect(profiles[agent].isAgent).toBe(true);
});

test("deduplicates and stably orders timeline messages by timestamp then id", () => {
  const base = {
    channelId: "channel",
    author: "aa".repeat(32),
    content: "message",
    kind: 9,
    tags: [["h", "channel"]],
  };
  expect(
    sortMessagesForTimeline([
      { ...base, id: "b", createdAt: 101 },
      { ...base, id: "z", createdAt: 100 },
      { ...base, id: "a", createdAt: 101 },
      { ...base, id: "a", createdAt: 101 },
    ]).map((message) => message.id),
  ).toEqual(["z", "a", "b"]);
});

test("parses date and time calendar events and rejects invalid dates", () => {
  expect(
    parseCalendarItem(
      event(31_922, [
        ["d", "one"],
        ["title", "Day"],
        ["start", "2026-08-08"],
      ]),
    )?.allDay,
  ).toBe(true);
  expect(
    parseCalendarItem(
      event(31_923, [
        ["d", "two"],
        ["title", "Call"],
        ["start", "1786164000"],
      ]),
    )?.start,
  ).toBeInstanceOf(Date);
  expect(
    parseCalendarItem(
      event(31_922, [
        ["d", "bad"],
        ["title", "Bad"],
        ["start", "not-a-date"],
      ]),
    ),
  ).toBeNull();
});

test("parses task and track state with semantic tags", () => {
  const task = parseTask(
    event(30_500, [
      ["d", "task"],
      ["title", "Ship"],
      ["t", "task-status:in-progress"],
      ["t", "task-priority:high"],
      ["t", "track-id:track"],
    ]),
  );
  expect(task).toMatchObject({
    status: "in-progress",
    priority: "high",
    trackId: "track",
  });
  const track = parseTrack(
    event(30_510, [
      ["d", "track"],
      ["title", "Launch"],
      ["t", "track-status:active"],
      ["archived", "false"],
    ]),
  );
  expect(track).toMatchObject({
    name: "Launch",
    status: "active",
    archived: false,
  });
  expect(
    parseTrack(
      event(30_510, [
        ["d", "paused-track"],
        ["title", "Paused launch"],
        ["t", "track-status:paused"],
        ["archived", "false"],
      ]),
    ),
  ).toMatchObject({ status: "paused" });
  expect(
    parseTrack(
      event(30_510, [
        ["d", "unknown-track"],
        ["title", "Unknown"],
        ["t", "track-status:future"],
        ["archived", "false"],
      ]),
    ),
  ).toBeNull();
  expect(
    parseTask(
      event(30_510, [
        ["d", "wrong"],
        ["title", "Wrong"],
      ]),
    ),
  ).toBeNull();
});

test("latest state wins for replaceable coordinates", () => {
  expect(
    latestByCoordinate([
      { id: "one", updatedAt: 1, value: "old" },
      { id: "one", updatedAt: 2, value: "new" },
    ]),
  ).toEqual([{ id: "one", updatedAt: 2, value: "new" }]);
});
