import assert from "node:assert/strict";
import test from "node:test";
import {
  sortTracks,
  trackMatchesScope,
  visibleTrackProgress,
} from "./trackProgress.ts";

const track = (id, status, archived = false, updatedAt = 1) => ({
  id,
  eventId: `${id}-event`,
  name: id,
  description: "",
  owner: "owner",
  startDate: "2026-08-01",
  endDate: id === "later" ? "2026-09-01" : "2026-08-30",
  status,
  archived,
  creator: "creator",
  lastEditor: "editor",
  createdAt: 1,
  updatedAt,
});

const task = (id, trackId, status = "todo", archived = false) => ({
  id,
  eventId: `${id}-event`,
  title: id,
  description: "",
  assignee: null,
  status,
  priority: "none",
  dueDate: null,
  labels: [],
  trackId,
  project: null,
  channelId: null,
  creator: "creator",
  lastEditor: "editor",
  createdAt: 1,
  updatedAt: 1,
  archived,
});

test("derives progress only from visible, non-archived tasks", () => {
  assert.deepEqual(
    visibleTrackProgress("one", [
      task("done", "one", "done"),
      task("open", "one"),
      task("other", "two", "done"),
      task("archived", "one", "done", true),
    ]),
    { completed: 1, total: 2, percent: 50 },
  );
});

test("separates current, completed, and archived scopes", () => {
  assert.equal(trackMatchesScope(track("active", "active"), "current"), true);
  assert.equal(
    trackMatchesScope(track("done", "completed"), "completed"),
    true,
  );
  assert.equal(
    trackMatchesScope(track("old", "completed", true), "archived"),
    true,
  );
  assert.equal(
    trackMatchesScope(track("old", "completed", true), "completed"),
    false,
  );
});

test("sorts current work by active first and ending date", () => {
  const result = sortTracks(
    [
      track("planned", "planned"),
      track("later", "active"),
      track("active", "active"),
    ],
    "current",
  );
  assert.deepEqual(
    result.map((item) => item.id),
    ["active", "later", "planned"],
  );
});

test("sorts completed and archived work by recent update", () => {
  const result = sortTracks(
    [track("old", "completed", true, 2), track("new", "canceled", true, 8)],
    "archived",
  );
  assert.deepEqual(
    result.map((item) => item.id),
    ["new", "old"],
  );
});
