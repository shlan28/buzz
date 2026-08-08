import { expect, test } from "@playwright/test";
import { parseCalendarItem } from "../../src/features/calendar/eventCodec";
import {
  parseChannel,
  parseMessage,
} from "../../src/features/channels/eventCodec";
import { parseTask } from "../../src/features/tasks/eventCodec";
import { parseTrack } from "../../src/features/tracks/eventCodec";
import { latestByCoordinate } from "../../src/shared/domain/eventTags";
import type { NostrEvent } from "../../src/shared/lib/nostr-client";

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
  expect(parseMessage(event(9, [["h", "general"]], "Hello"))?.content).toBe(
    "Hello",
  );
  expect(parseMessage(event(9, [], "leak"))).toBeNull();
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
