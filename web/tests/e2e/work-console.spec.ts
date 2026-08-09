import { expect, test } from "@playwright/test";
import { installWorkConsoleFixture } from "../helpers/desktopParityFixtures";

test.beforeEach(async ({ page }) => installWorkConsoleFixture(page));

test("renders real work-console views from one authenticated data model", async ({
  page,
}) => {
  await page.goto("/app/channels");
  await expect(page.getByText("Fixture message from Buzz")).toBeVisible();
  await expect(page.getByRole("link", { name: "Hermes" })).toBeVisible();
  await page.getByRole("link", { name: "Hermes" }).click();
  await expect(page.getByPlaceholder("Message Hermes")).toBeVisible();
  await page.getByPlaceholder("Message Hermes").fill("@");
  await expect(page.getByTestId("mention-autocomplete")).toContainText(
    "Hermes",
  );
  await page.getByRole("button", { name: /Hermes/ }).click();
  await expect(page.getByPlaceholder("Message Hermes")).toHaveValue("@Hermes ");
  await page.getByRole("link", { name: "Inbox" }).click();
  await expect(page.getByTestId("inbox-screen")).toBeVisible();
  await page.getByRole("link", { name: "Calendar" }).click();
  await page.getByRole("button", { name: "Month" }).click();
  await expect(
    page.getByRole("button", { name: "Agent review" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Tasks" }).click();
  await expect(page.getByText("Ship iPad console")).toBeVisible();
  await page.getByRole("button", { name: "List view" }).click();
  await page.getByText("Ship iPad console", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ship iPad console" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Tracks" }).click();
  await expect(page.getByText("Web launch")).toBeVisible();
  await page.getByText("Web launch", { exact: true }).click();
  await expect(
    page.getByTestId("track-detail-screen").getByRole("heading", {
      name: "Web launch",
    }),
  ).toBeVisible();
});

test("opens settings, persists appearance, and collapses the sidebar", async ({
  page,
}) => {
  await page.goto("/app/inbox");
  const sidebar = page.getByTestId("app-sidebar");
  await expect(sidebar).toHaveCSS("width", "300px");
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await expect(sidebar).toHaveCSS("width", "48px");
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByTestId("open-settings").click();
  await expect(page.getByTestId("settings-screen")).toBeVisible();
  await page.getByRole("button", { name: "Appearance" }).click();
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("matches Desktop Settings container layers and action spacing", async ({
  page,
}) => {
  await page.goto("/app/settings");
  const contentSurface = page.getByTestId("content-surface");
  await expect(contentSurface).toBeVisible();

  await page.getByRole("button", { name: "Appearance" }).click();
  await expect(page.getByTestId("appearance-mode-selector")).toBeVisible();
  await expect(page.locator('[data-settings-option-group="true"]')).toHaveCount(
    0,
  );

  for (const section of ["Connection", "Paired device"]) {
    await page.getByRole("button", { name: section }).click();
    const group = page.locator('[data-settings-option-group="true"]');
    const actions = page.getByTestId("panel-actions");
    await expect(group).toHaveCount(1);
    await expect(actions).toBeVisible();
    const [groupBox, actionControlBox] = await Promise.all([
      group.boundingBox(),
      actions.locator("button, a").boundingBox(),
    ]);
    expect(groupBox).not.toBeNull();
    expect(actionControlBox).not.toBeNull();
    expect(
      (groupBox?.y ?? 0) +
        (groupBox?.height ?? 0) -
        ((actionControlBox?.y ?? 0) + (actionControlBox?.height ?? 0)),
    ).toBeGreaterThanOrEqual(15);
  }

  await page.getByRole("button", { name: "Desktop settings" }).click();
  await expect(page.locator('[data-settings-option-group="true"]')).toHaveCount(
    1,
  );
  const copy = page.getByTestId("desktop-settings-copy");
  await expect(copy).toHaveCSS("border-top-width", "0px");
  await expect(copy).toHaveCSS("border-radius", "0px");
  await expect(copy).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("keeps Execute as the only Task write action", async ({ page }) => {
  await page.goto("/app/calendar");
  await expect(page.getByText(/Read only/)).toBeVisible();
  for (const path of ["tasks", "tracks/track-1"]) {
    await page.goto(`/app/${path}`);
    await expect(page.getByText(/Execute only/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /create|delete|edit/i }),
    ).toHaveCount(0);
  }
});

test("matches desktop message presentation and content surfaces", async ({
  page,
}) => {
  await page.goto("/app/channels/11111111-1111-4111-8111-111111111111");

  await expect(
    page.getByTestId("dm-avatar-11111111-1111-4111-8111-111111111111"),
  ).toContainText("H");
  await expect(page.getByTestId("message-avatar").first()).toContainText("H");
  await expect(
    page.getByRole("heading", { name: "Agent update" }),
  ).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Safe link" })).toHaveAttribute(
    "href",
    "https://example.com",
  );
  await expect(page.getByRole("link", { name: "Unsafe" })).not.toHaveAttribute(
    "href",
    /javascript:/,
  );

  await expect(page.getByTestId("content-surface")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(
    page.getByRole("link", { name: "Tasks" }).locator("svg"),
  ).toHaveClass(/lucide-list-todo/);
  await expect(
    page.getByRole("link", { name: "Tracks" }).locator("svg"),
  ).toHaveClass(/lucide-route/);

  await page.getByRole("link", { name: "Tasks" }).click();
  await page.getByRole("button", { name: "List view" }).click();
  await page.getByText("Ship iPad console", { exact: true }).click();
  await expect(
    page.getByRole("complementary").filter({
      has: page.getByRole("heading", { name: "Ship iPad console" }),
    }),
  ).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("matches desktop task cards, grouping, and track filtering", async ({
  page,
}) => {
  await page.goto("/app/tasks");
  await expect(
    page.getByRole("combobox", { name: "Group tasks by" }),
  ).toHaveValue("assignee");
  await expect(page.getByRole("heading", { name: "Hermes" })).toBeVisible();
  const card = page.getByTestId("task-card-task-1");
  await expect(card).toContainText("Complete the read-only work console");
  await expect(card).toContainText("In progress");
  await expect(card).toContainText("Web launch");
  await expect(card).toContainText("+1");
  await expect(card).toContainText("Hermes");
  await expect(card).toContainText("Agent");
  await page
    .getByRole("combobox", { name: "Filter by track" })
    .selectOption("track-1");
  await expect(page).toHaveURL(/track=track-1/);
  await expect(page.getByText("Untracked follow-up")).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Group tasks by" })
    .selectOption("track");
  await expect(page).toHaveURL(/group=track/);
  await expect(page.getByRole("heading", { name: "Web launch" })).toBeVisible();

  await page.getByRole("button", { name: "List view" }).click();
  await expect(
    page.getByText("Ship iPad console", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Untracked follow-up")).toHaveCount(0);
});

test("opens conversations at the bottom", async ({ page }) => {
  await page.goto("/app/channels/11111111-1111-4111-8111-111111111111");
  const timeline = page.getByRole("region", { name: "Hermes messages" });
  await expect(timeline.getByText("History message 36")).toBeVisible();
  await expect
    .poll(() =>
      timeline.evaluate(
        (element) =>
          element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThanOrEqual(1);
});

test("aligns the timeline and composer and shows DM delivery progress", async ({
  page,
}) => {
  await page.goto("/app/channels/11111111-1111-4111-8111-111111111111");
  const content = page.getByTestId("conversation-messages");
  const composer = page.getByTestId("conversation-composer");
  const [contentBox, composerBox] = await Promise.all([
    content.boundingBox(),
    composer.boundingBox(),
  ]);
  expect(contentBox).not.toBeNull();
  expect(composerBox).not.toBeNull();
  expect(Math.abs((contentBox?.x ?? 0) - (composerBox?.x ?? 0))).toBeLessThan(
    1,
  );
  expect(
    Math.abs((contentBox?.width ?? 0) - (composerBox?.width ?? 0)),
  ).toBeLessThan(1);

  const textarea = page.getByPlaceholder("Message Hermes");
  await textarea.fill("Optimistic hello from Web");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByTestId("message-delivery-status")).toContainText(
    "Signing and sending",
  );
  await expect(page.getByText("Optimistic hello from Web")).toBeVisible();
  await expect(page.getByTestId("message-delivery-status")).toContainText(
    "Sent",
  );
  await expect(page.getByTestId("message-delivery-status")).toContainText(
    "Waiting for Hermes",
    { timeout: 2_000 },
  );
});

test("uses distinct fallback colors for agents and users", async ({ page }) => {
  await page.goto("/app/channels/00000000-0000-4000-8000-000000000001");
  await page.getByPlaceholder("Message #general").fill("@Cod");
  const agentFallback = page
    .getByRole("button", { name: /Codex/ })
    .getByRole("img");
  const userFallback = page.getByTestId("open-settings").getByRole("img");
  const [agentColor, userColor] = await Promise.all([
    agentFallback.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
    userFallback.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ]);
  expect(agentColor).not.toBe(userColor);
});

test("opens a track detail with its read-only task board", async ({ page }) => {
  await page.goto("/app/tracks");
  await page.getByText("Web launch", { exact: true }).click();
  await expect(page).toHaveURL(/\/app\/tracks\/track-1$/);
  await expect(page.getByTestId("track-detail-screen")).toBeVisible();
  await expect(page.getByText("0/1 tasks complete")).toBeVisible();
  await expect(page.getByTestId("task-card-task-1")).toBeVisible();
  await expect(page.getByText("Untracked follow-up")).toHaveCount(0);
  await expect(page.getByTestId("task-column-in-progress")).toContainText(
    "Ship iPad console",
  );
  await page.reload();
  await expect(page.getByTestId("track-detail-screen")).toContainText(
    "Web launch",
  );
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.getByTestId("task-list")).toContainText(
    "Ship iPad console",
  );
  await page.getByText("Ship iPad console", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ship iPad console" }),
  ).toBeVisible();
  await expect(page.getByText("Hermes").last()).toBeVisible();
});

test("opens Inbox detail with agent identity and Markdown", async ({
  page,
}) => {
  await page.goto("/app/inbox");
  await expect(page.locator('[data-testid^="inbox-item-"]')).toHaveCount(1);
  await expect(page.getByText("Fixture message from Buzz")).toHaveCount(0);
  const agentItem = page.getByTestId(
    "inbox-item-dm:11111111-1111-4111-8111-111111111111",
  );
  await expect(agentItem).toContainText("Hermes");
  await expect(agentItem).toContainText("DM from Hermes");
  await expect(agentItem.getByRole("img")).toContainText("H");
  await agentItem.click();
  await expect(page).toHaveURL(/item=dm%3A/);
  const detail = page.getByTestId("inbox-detail");
  await expect(detail.getByTestId("inbox-selected-message")).toContainText(
    "History message 36",
  );
  await expect(
    detail.getByRole("heading", { name: "Agent update" }),
  ).toBeVisible();
  await expect(detail.getByRole("listitem")).toHaveCount(2);
  await page.reload();
  await expect(page.getByTestId("inbox-selected-message")).toContainText(
    "History message 36",
  );
  await page.getByRole("button", { name: "Open conversation" }).click();
  await expect(page).toHaveURL(
    /\/app\/channels\/11111111-1111-4111-8111-111111111111/,
  );
});
