import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCreateTrackEvent,
  buildMutateTrackEvent,
  isArchivableStatus,
  parseTrackState,
  uniqueMembers,
} from "./trackEvents.ts";

const relay = "a".repeat(64);
const event = {
  id: "b".repeat(64),
  pubkey: relay,
  kind: 30510,
  content: "A reliable desktop foundation",
  created_at: 10,
  sig: "c".repeat(128),
  tags: [
    ["d", "00000000-0000-4000-8000-000000000001"],
    ["title", "Desktop foundations"],
    ["p", "d".repeat(64), "", "owner"],
    ["member", "1".repeat(64)],
    ["member", "2".repeat(64)],
    ["start_date", "2026-08-01"],
    ["end_date", "2026-08-30"],
    ["t", "track-status:active"],
    ["creator", "e".repeat(64)],
    ["last_editor", "f".repeat(64)],
    ["created_at", "5"],
    ["archived", "false"],
  ],
};

test("parses a Relay-signed track state", () => {
  assert.deepEqual(parseTrackState(event, relay), {
    id: "00000000-0000-4000-8000-000000000001",
    eventId: event.id,
    name: "Desktop foundations",
    description: "A reliable desktop foundation",
    owner: "d".repeat(64),
    members: ["1".repeat(64), "2".repeat(64)],
    startDate: "2026-08-01",
    endDate: "2026-08-30",
    status: "active",
    archived: false,
    creator: "e".repeat(64),
    lastEditor: "f".repeat(64),
    createdAt: 5,
    updatedAt: 10,
    canRead: true,
    canManage: false,
  });
});

test("accepts paused as a non-archivable Track status", () => {
  const pausedEvent = {
    ...event,
    tags: event.tags.map((tag) =>
      tag[0] === "t" && tag[1]?.startsWith("track-status:")
        ? ["t", "track-status:paused"]
        : tag,
    ),
  };
  assert.equal(parseTrackState(pausedEvent, relay)?.status, "paused");
  assert.equal(isArchivableStatus("paused"), false);
});

test("rejects untrusted and malformed track states", () => {
  assert.equal(
    parseTrackState({ ...event, pubkey: "0".repeat(64) }, relay),
    null,
  );
  assert.equal(
    parseTrackState(
      {
        ...event,
        tags: event.tags.map((tag) =>
          tag[0] === "end_date" ? ["end_date", "2026-07-31"] : tag,
        ),
      },
      relay,
    ),
    null,
  );
});

test("builds create and version-bound mutate commands", () => {
  const draft = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "  Desktop foundations  ",
    description: "Outcome",
    owner: "d".repeat(64),
    members: ["1".repeat(64), "1".repeat(64), "d".repeat(64)],
    startDate: "2026-08-01",
    endDate: "2026-08-30",
    status: "planned",
  };
  const create = buildCreateTrackEvent(draft);
  assert.equal(create.kind, 42510);
  assert.deepEqual(
    create.tags.find((tag) => tag[0] === "archived"),
    ["archived", "false"],
  );
  assert.deepEqual(
    create.tags.filter((tag) => tag[0] === "member"),
    [["member", "1".repeat(64)]],
  );
  assert.deepEqual(
    create.tags.find((tag) => tag[0] === "title"),
    ["title", "Desktop foundations"],
  );

  const track = parseTrackState(event, relay);
  assert.ok(track);
  const mutate = buildMutateTrackEvent(track, {
    status: "completed",
    archived: true,
    members: ["2".repeat(64), "3".repeat(64), "3".repeat(64)],
  });
  assert.equal(mutate.kind, 42511);
  assert.deepEqual(
    mutate.tags.find((tag) => tag[0] === "previous"),
    ["previous", event.id],
  );
  assert.equal(
    mutate.tags.some((tag) => tag[0] === "clear" && tag[1] === "members"),
    true,
  );
  assert.deepEqual(
    mutate.tags.filter((tag) => tag[0] === "member"),
    [
      ["member", "2".repeat(64)],
      ["member", "3".repeat(64)],
    ],
  );
  assert.deepEqual(
    mutate.tags.find((tag) => tag[0] === "archived"),
    ["archived", "true"],
  );
});

test("blocks invalid dates and archiving unfinished work", () => {
  assert.throws(
    () =>
      buildCreateTrackEvent({
        id: "00000000-0000-4000-8000-000000000001",
        name: "Track",
        description: "",
        owner: "d".repeat(64),
        members: [],
        startDate: "2026-08-02",
        endDate: "2026-08-01",
        status: "planned",
      }),
    /End date/,
  );
  const track = parseTrackState(event, relay);
  assert.ok(track);
  assert.throws(
    () => buildMutateTrackEvent(track, { archived: true }),
    /completed or canceled/,
  );
  const archived = parseTrackState(
    {
      ...event,
      tags: event.tags.map((tag) => {
        if (tag[0] === "archived") return ["archived", "true"];
        if (tag[0] === "t" && tag[1].startsWith("track-status:")) {
          return ["t", "track-status:completed"];
        }
        return tag;
      }),
    },
    relay,
  );
  assert.ok(archived);
  assert.throws(
    () => buildMutateTrackEvent(archived, { status: "active" }),
    /completed or canceled/,
  );
});

test("normalizes member sets case-insensitively and excludes the owner", () => {
  assert.deepEqual(
    uniqueMembers(
      ["A".repeat(64), "a".repeat(64), "b".repeat(64), "invalid"],
      "b".repeat(64),
    ),
    ["A".repeat(64)],
  );
});
