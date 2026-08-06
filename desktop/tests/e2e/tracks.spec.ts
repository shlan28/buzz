import { expect, test } from "@playwright/test";
import type { RelayEvent } from "../../src/shared/api/types";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

const RELAY_SELF = "12".repeat(32);
const VIEWER = "deadbeef".repeat(8);
const TYLER = TEST_IDENTITIES.tyler.pubkey;
const ALICE = TEST_IDENTITIES.alice.pubkey;
const BOB = TEST_IDENTITIES.bob.pubkey;
const CHARLIE = TEST_IDENTITIES.charlie.pubkey;
const ACTIVE_TRACK = "e4b9fdaf-f1e8-4d36-8bc4-a32435536335";
const COMPLETED_TRACK = "f56cff16-aea2-4985-8441-aec87fb2525e";
const ARCHIVED_TRACK = "6d616e78-d75c-455f-92e1-b3f635cf3038";

function trackState(input: {
  id: string;
  eventId: string;
  name: string;
  status: "planned" | "active" | "completed" | "canceled";
  archived?: boolean;
  createdAt?: number;
  owner?: string;
  creator?: string;
  members?: string[];
}): RelayEvent {
  const createdAt = input.createdAt ?? 1_785_547_800;
  return {
    id: input.eventId,
    pubkey: RELAY_SELF,
    created_at: createdAt,
    kind: 30_510,
    tags: [
      ["d", input.id],
      ["title", input.name],
      ["p", input.owner ?? VIEWER],
      ...(input.members ?? []).map((member) => ["member", member]),
      ["start_date", "2026-08-01"],
      ["end_date", "2026-09-30"],
      ["t", `track-status:${input.status}`],
      ["archived", String(input.archived ?? false)],
      ["creator", input.creator ?? VIEWER],
      ["last_editor", input.owner ?? VIEWER],
      ["created_at", String(createdAt)],
    ],
    content: `${input.name} description`,
    sig: "mocksig".repeat(20).slice(0, 128),
  };
}

function taskState(): RelayEvent {
  return {
    id: "41".repeat(32),
    pubkey: RELAY_SELF,
    created_at: 1_785_547_900,
    kind: 30_500,
    tags: [
      ["d", "48499a3a-4e63-4e3e-a6d2-ad82450c0cc4"],
      ["title", "Prepare launch checklist"],
      ["t", "task-status:todo"],
      ["t", "task-priority:high"],
      ["t", `track-id:${ACTIVE_TRACK}`],
      ["t", "label:launch"],
      ["creator", TYLER],
      ["last_editor", TYLER],
      ["source_event", "42".repeat(32)],
      ["created_at", "1785547900"],
    ],
    content: "Coordinate the release steps.",
    sig: "mocksig".repeat(20).slice(0, 128),
  };
}

async function installTracks(page: Parameters<typeof installMockBridge>[0]) {
  await installMockBridge(page, {
    relaySelf: RELAY_SELF,
    taskEvents: [taskState()],
    trackEvents: [
      trackState({
        id: ACTIVE_TRACK,
        eventId: "31".repeat(32),
        name: "Desktop launch",
        status: "active",
      }),
      trackState({
        id: COMPLETED_TRACK,
        eventId: "32".repeat(32),
        name: "Relay hardening",
        status: "completed",
      }),
      trackState({
        id: ARCHIVED_TRACK,
        eventId: "33".repeat(32),
        name: "Archived research",
        status: "canceled",
        archived: true,
      }),
    ],
  });
}

test("Tracks scopes keep archived work recoverable", async ({ page }) => {
  await installTracks(page);
  await page.goto("/#/tracks");

  await expect(page.getByText("Desktop launch", { exact: true })).toBeVisible();
  await expect(page.getByText("Relay hardening", { exact: true })).toHaveCount(
    0,
  );

  await page.getByRole("tab", { name: "Completed" }).click();
  await expect(
    page.getByText("Relay hardening", { exact: true }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Archived" }).click();
  await expect(
    page.getByText("Archived research", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(
    page.getByText("No archived tracks", { exact: true }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Completed" }).click();
  await expect(
    page.getByText("Archived research", { exact: true }),
  ).toBeVisible();
});

test("Track detail shows its tasks and opens a filtered Tasks view", async ({
  page,
}) => {
  await installTracks(page);
  await page.goto(`/#/tracks/${ACTIVE_TRACK}`);

  await expect(page.getByTestId("track-detail-screen")).toContainText(
    "Desktop launch",
  );
  await expect(
    page.getByText("Prepare launch checklist", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View tasks" }).click();
  await expect(page).toHaveURL(new RegExp(`track=${ACTIVE_TRACK}`));
  await expect(page.getByLabel("Filter by track")).toHaveValue(ACTIVE_TRACK);
  await expect(
    page.getByText("Prepare launch checklist", { exact: true }),
  ).toBeVisible();
});

test("Track members can read details and linked tasks but cannot manage the Track", async ({
  page,
}) => {
  await installMockBridge(page, {
    relaySelf: RELAY_SELF,
    taskEvents: [taskState()],
    trackEvents: [
      trackState({
        id: ACTIVE_TRACK,
        eventId: "51".repeat(32),
        name: "Member-visible launch",
        status: "active",
        owner: ALICE,
        creator: BOB,
        members: [VIEWER],
      }),
    ],
  });
  await page.goto(`/#/tracks/${ACTIVE_TRACK}`);

  await expect(page.getByTestId("track-detail-screen")).toContainText(
    "Member-visible launch",
  );
  await expect(page.getByTestId("track-detail-screen")).toContainText(
    "Read only",
  );
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(
    page.getByText("Prepare launch checklist", { exact: true }),
  ).toBeVisible();
});

test("creator access is read-only when ownership was assigned elsewhere", async ({
  page,
}) => {
  await installMockBridge(page, {
    relaySelf: RELAY_SELF,
    trackEvents: [
      trackState({
        id: ACTIVE_TRACK,
        eventId: "52".repeat(32),
        name: "Creator handoff",
        status: "planned",
        owner: ALICE,
        creator: VIEWER,
      }),
    ],
  });
  await page.goto(`/#/tracks/${ACTIVE_TRACK}`);

  await expect(
    page.getByText("Creator handoff", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Read only", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
});

test("unrelated identities cannot discover a Track or its linked tasks", async ({
  page,
}) => {
  await installMockBridge(page, {
    relaySelf: RELAY_SELF,
    taskEvents: [taskState()],
    trackEvents: [
      trackState({
        id: ACTIVE_TRACK,
        eventId: "53".repeat(32),
        name: "Private launch",
        status: "active",
        owner: ALICE,
        creator: BOB,
        members: [CHARLIE],
      }),
    ],
  });

  await page.goto("/#/tracks");
  await expect(page.getByText("Private launch", { exact: true })).toHaveCount(
    0,
  );
  await page.goto(`/#/tracks/${ACTIVE_TRACK}`);
  await expect(
    page.getByText("Track not found", { exact: true }),
  ).toBeVisible();
  await page.goto("/#/tasks");
  await expect(
    page.getByText("Prepare launch checklist", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Restricted track", { exact: true })).toHaveCount(
    0,
  );
});

test("owner Agent inherits management UI from its owner", async ({ page }) => {
  await installMockBridge(page, {
    relaySelf: RELAY_SELF,
    searchProfiles: [
      {
        pubkey: VIEWER,
        displayName: "Owner Agent",
        ownerPubkey: ALICE,
        isAgent: true,
      },
    ],
    trackEvents: [
      trackState({
        id: ACTIVE_TRACK,
        eventId: "54".repeat(32),
        name: "Delegated operations",
        status: "active",
        owner: ALICE,
        creator: BOB,
      }),
    ],
  });
  await page.goto(`/#/tracks/${ACTIVE_TRACK}`);

  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByTestId("track-editor-dialog")).toBeVisible();
  await expect(page.getByLabel("Add track members")).toBeEnabled();
});

test("Track editor saves a deduplicated multi-member selection", async ({
  page,
}) => {
  await installTracks(page);
  await page.goto(`/#/tracks/${ACTIVE_TRACK}`);
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Add track members").click();
  await page.getByRole("menuitemcheckbox", { name: /alice/i }).click();
  await page.getByRole("menuitemcheckbox", { name: /bob/i }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("track-member-chips")).toContainText("alice");
  await expect(page.getByTestId("track-member-chips")).toContainText("bob");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByTestId("track-members")).toContainText("alice");
  await expect(page.getByTestId("track-members")).toContainText("bob");
});
