import { expect, test } from "@playwright/test";
import type { RelayEvent } from "../../src/shared/api/types";
import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

const RELAY_SELF = "12".repeat(32);
const BOB = TEST_IDENTITIES.bob.pubkey;
const TYLER = TEST_IDENTITIES.tyler.pubkey;
const MOCK_VIEWER = "deadbeef".repeat(8);
const FIRST_TASK = "10eef02c-9be8-4055-a747-e348d5a405ad";
const DONE_TASK = "f88ae55f-2fbb-45f4-a593-d9ab88e7cbe3";

function taskState(input: {
  id: string;
  eventId: string;
  title: string;
  description?: string;
  assignee?: string | null;
  status?: "todo" | "in-progress" | "blocked" | "done";
  priority?: "none" | "high" | "urgent";
  due?: number;
  createdAt?: number;
}): RelayEvent {
  const createdAt = input.createdAt ?? 1_785_547_800;
  return {
    id: input.eventId,
    pubkey: RELAY_SELF,
    created_at: createdAt,
    kind: 30_500,
    tags: [
      ["d", input.id],
      ["title", input.title],
      ["t", `task-status:${input.status ?? "todo"}`],
      ["t", `task-priority:${input.priority ?? "none"}`],
      ...(input.assignee ? [["p", input.assignee]] : []),
      ["creator", TYLER],
      ["last_editor", TYLER],
      ["source_event", "ab".repeat(32)],
      ["created_at", String(createdAt)],
      ...(input.due ? [["due", String(input.due)]] : []),
    ],
    content: input.description ?? "",
    sig: "mocksig".repeat(20).slice(0, 128),
  };
}

async function installTasks(
  page: Parameters<typeof installMockBridge>[0],
  options?: { rejectNextPublish?: string },
) {
  await installMockBridge(page, {
    relaySelf: RELAY_SELF,
    relayAgents: [
      {
        pubkey: MOCK_VIEWER,
        name: "Stale viewer agent",
        respondTo: "owner-only",
      },
    ],
    searchProfiles: [
      {
        pubkey: MOCK_VIEWER,
        displayName: "lu",
        ownerPubkey: null,
        isAgent: false,
      },
    ],
    taskEvents: [
      taskState({
        id: FIRST_TASK,
        eventId: "21".repeat(32),
        title: "Audit onboarding flow",
        description: "Check the first-run experience.",
        assignee: null,
        priority: "high",
        due: 1_787_241_599,
      }),
      taskState({
        id: DONE_TASK,
        eventId: "22".repeat(32),
        title: "Publish old release notes",
        assignee: BOB,
        status: "done",
        createdAt: 1_785_547_700,
      }),
    ],
    taskPublishErrors: options?.rejectNextPublish
      ? [options.rejectNextPublish]
      : undefined,
  });
}

test("creates a task and shows its Relay-confirmed state", async ({ page }) => {
  await installTasks(page);
  await page.goto("/#/tasks");
  await page.getByRole("button", { name: "Task", exact: true }).click();
  const dialog = page.getByTestId("create-task-dialog");
  await dialog.getByLabel("Title").fill("Review Agent task permissions");
  await dialog
    .getByLabel("Description")
    .fill("Confirm owner-only assignment behavior.");
  await dialog.getByLabel("Priority").selectOption("urgent");
  await dialog.getByLabel("Due date").fill("2026-08-20");
  await dialog.getByRole("button", { name: "Create task" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("Review Agent task permissions", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("urgent", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Review Agent task permissions" })
    .click();
  await expect(
    page.getByTestId("task-detail-panel").getByLabel("Due date"),
  ).toHaveValue("2026-08-20");
});

test("keyboard opens a task, edits text, and transfers its owner", async ({
  page,
}) => {
  await installTasks(page);
  await page.goto("/#/tasks");
  const card = page.getByTestId(`task-card-${FIRST_TASK}`);
  const openTask = card.getByRole("button", {
    name: "Audit onboarding flow",
  });
  await openTask.focus();
  await openTask.press("Enter");

  const panel = page.getByTestId("task-detail-panel");
  await expect(panel).toBeVisible();
  await panel.getByLabel("Title").fill("Audit onboarding and recovery");
  await panel.getByLabel("Description").fill("Include reconnect recovery.");
  await panel.getByRole("button", { name: "Save text" }).click();
  await expect(panel.getByLabel("Title")).toHaveValue(
    "Audit onboarding and recovery",
  );
  await expect(
    panel.getByRole("heading", { name: "Audit onboarding and recovery" }),
  ).toBeVisible();

  await panel.getByLabel("Assignee").selectOption({ label: "bob" });
  await expect(
    panel.getByLabel("Assignee").locator("option:checked"),
  ).toHaveText("bob");

  await panel.getByLabel("Due date").fill("2026-08-31");
  await panel.getByRole("button", { name: "Save due date" }).click();
  await expect(panel.getByLabel("Due date")).toHaveValue("2026-08-31");
  await panel.getByRole("button", { name: "Clear" }).click();
  await expect(panel.getByLabel("Due date")).toHaveValue("");

  await panel.getByRole("button", { name: "Close task details" }).click();
  await expect(
    page.getByText("Audit onboarding and recovery", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "bob", exact: true }),
  ).toBeVisible();
});

test("assigning a task to the current user survives Relay confirmation", async ({
  page,
}) => {
  await installTasks(page);
  await page.goto(`/#/tasks?task=${FIRST_TASK}`);

  const assignee = page.getByTestId("task-detail-panel").getByLabel("Assignee");
  await assignee.selectOption({ label: "lu" });
  await expect(assignee.locator("option:checked")).toHaveText("lu");

  const mutation = await page.evaluate(() =>
    window.__BUZZ_E2E_SIGNED_EVENTS__?.findLast(
      (event) => event.kind === 42_501,
    ),
  );
  expect(mutation?.tags).toContainEqual(["p", MOCK_VIEWER]);
  expect(mutation?.tags).not.toContainEqual(["clear", "assignee"]);
});

test("board cards and list rows show task planning details", async ({
  page,
}) => {
  await installTasks(page);
  await page.goto("/#/tasks");

  const card = page.getByTestId(`task-card-${FIRST_TASK}`);
  await expect(card).toContainText("Check the first-run experience.");
  await expect(card).toContainText("2026-08-20");

  await card.getByLabel("Move Audit onboarding flow to").selectOption({
    label: "lu",
  });
  await expect(
    page
      .getByTestId(`task-column-${MOCK_VIEWER}`)
      .getByTestId(`task-card-${FIRST_TASK}`),
  ).toBeVisible();

  const cardMutation = await page.evaluate(() =>
    window.__BUZZ_E2E_SIGNED_EVENTS__?.findLast(
      (event) => event.kind === 42_501,
    ),
  );
  expect(cardMutation?.tags).toContainEqual(["p", MOCK_VIEWER]);

  await page.getByRole("button", { name: "List view" }).click();
  const row = page.getByTestId(`task-list-row-${FIRST_TASK}`);
  await expect(row).toContainText("lu");
  await expect(row).toContainText("2026-08-20");
  await expect(row).toContainText("high");
});

test("assignee options exclude Agent profiles outside current members", async ({
  page,
}) => {
  await installTasks(page);
  await page.goto(`/#/tasks?task=${FIRST_TASK}`);

  const assignee = page.getByTestId("task-detail-panel").getByLabel("Assignee");
  await expect(assignee.locator("option")).toContainText([
    "Unassigned",
    "alice · Agent",
    "bob",
  ]);
  await expect(assignee.locator("option")).not.toContainText(["charlie"]);
});

test("dragging a card to another owner transfers the task", async ({
  page,
}) => {
  await installTasks(page);
  await page.goto("/#/tasks");
  await page.getByRole("checkbox", { name: "Show empty owners" }).check();

  const card = page.getByTestId(`task-card-${FIRST_TASK}`);
  const bobColumn = page.getByTestId(`task-column-${BOB}`);
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await card
    .locator("..")
    .dispatchEvent("dragstart", { dataTransfer: transfer });
  await bobColumn.dispatchEvent("dragover", { dataTransfer: transfer });
  await bobColumn.dispatchEvent("drop", { dataTransfer: transfer });

  await expect(bobColumn.getByTestId(`task-card-${FIRST_TASK}`)).toBeVisible();
  await expect(
    page
      .getByTestId("task-column-unassigned")
      .getByTestId(`task-card-${FIRST_TASK}`),
  ).toHaveCount(0);
});

test("failed mutation keeps the previous state and reports the rejection", async ({
  page,
}) => {
  await installTasks(page, { rejectNextPublish: "restricted: test denial" });
  await page.goto(`/#/tasks?task=${FIRST_TASK}`);
  const panel = page.getByTestId("task-detail-panel");
  await expect(panel).toBeVisible();
  await panel.getByLabel("Status").selectOption("blocked");

  await expect(panel.getByText("restricted: test denial")).toBeVisible();
  await expect(panel.getByLabel("Status")).toHaveValue("todo");
  await panel.getByRole("button", { name: "Close task details" }).click();
  await expect(
    page.getByTestId(`task-card-${FIRST_TASK}`).getByText("Todo"),
  ).toBeVisible();
});

test("deep link opens details and search/show-done filters visible tasks", async ({
  page,
}) => {
  await installTasks(page);
  await page.goto(`/#/tasks?task=${FIRST_TASK}`);
  await expect(page.getByTestId("task-detail-panel")).toContainText(
    "Audit onboarding flow",
  );
  await page.getByRole("button", { name: "Close task details" }).click();

  await expect(page.getByText("Publish old release notes")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Show done" }).check();
  await expect(
    page.getByText("Publish old release notes", { exact: true }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search tasks" }).fill("onboarding");
  await expect(
    page.getByText("Audit onboarding flow", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Publish old release notes")).toHaveCount(0);
});
