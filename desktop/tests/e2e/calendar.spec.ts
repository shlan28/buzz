import { expect, test } from "@playwright/test";
import { installMockBridge } from "../helpers/bridge";

const OTHER_RELAY_AGENT =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

test.beforeEach(async ({ page }, testInfo) => {
  await installMockBridge(page, {
    managedAgents: [
      {
        pubkey: OTHER_RELAY_AGENT,
        name: "other-relay-agent",
      },
    ],
    relayAgents: [
      {
        pubkey:
          "a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff00",
        name: "nadia",
        status: "online",
      },
    ],
    searchProfiles: [
      {
        pubkey: OTHER_RELAY_AGENT,
        displayName: "other-relay-agent",
        ownerPubkey:
          "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        isAgent: true,
      },
    ],
    failCalendarHistoryUntilManualRetry: testInfo.title.includes(
      "calendar load error",
    ),
    failCalendarAuthorsUntilManualRetry: testInfo.title.includes(
      "agent source failure",
    )
      ? ["a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff00"]
      : undefined,
  });
});

test("calendar navigation restores view and date from URL", async ({
  page,
}) => {
  await page.goto("/#/calendar?view=month&date=2026-08-01");
  await expect(page.getByTestId("calendar-screen")).toBeVisible();
  await expect(page.getByTestId("calendar-month-view")).toBeVisible();
  await expect(page.getByTestId("calendar-range-title")).toContainText(
    "August 2026",
  );
  await page.getByRole("tab", { name: "Week" }).click();
  await expect(page).toHaveURL(/view=week/);
  await expect(page.getByTestId("calendar-week-view")).toBeVisible();
});

test("time grid spans midnight to midnight and preserves its scroll position", async ({
  page,
}) => {
  await page.goto("/#/calendar?view=week&date=2026-08-01");
  const week = page.getByTestId("calendar-week-view");
  await expect(week.getByText("00:00", { exact: true })).toHaveCount(1);
  await expect(week.getByText("23:00", { exact: true })).toHaveCount(1);
  await expect
    .poll(() => week.evaluate((element) => element.scrollTop))
    .toBeGreaterThanOrEqual(7 * 64 - 1);
  await week.evaluate((element) => {
    element.scrollTop = 11 * 64;
  });
  await page.getByRole("tab", { name: "Day" }).click();
  const day = page.getByTestId("calendar-day-view");
  await expect
    .poll(() => day.evaluate((element) => element.scrollTop))
    .toBeGreaterThanOrEqual(11 * 64 - 1);
});

test("owner sees an owned agent event as read-only with its author name", async ({
  page,
}) => {
  await page.goto("/#/calendar?view=day&date=2026-08-01");
  const event = page.getByText("Agent planning block", { exact: true });
  await expect(event).toBeVisible();
  await expect(page.getByText(/Created by nadia/)).toBeVisible();
  await event.click();
  const details = page.getByTestId("calendar-event-details");
  await expect(details).toContainText("Created by nadia");
  await expect(details.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(details.getByRole("button", { name: "Delete" })).toBeVisible();
});

test("calendar sources default on and independently hide agent events", async ({
  page,
}) => {
  await page.goto("/#/calendar?view=day&date=2026-08-01");
  const personal = page.getByRole("checkbox", { name: "Show Personal" });
  const agent = page.getByRole("checkbox", { name: "Show nadia" });
  await expect(personal).toBeChecked();
  await expect(agent).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Show other-relay-agent" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Personal focus block", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Agent planning block", { exact: true }),
  ).toBeVisible();

  await agent.uncheck();
  await expect(
    page.getByText("Agent planning block", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Personal focus block", { exact: true }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Week" }).click();
  await expect(agent).not.toBeChecked();
  await agent.check();
  await expect(
    page.getByText("Agent planning block", { exact: true }),
  ).toBeVisible();
});

test("agent source failure preserves Personal and retries independently", async ({
  page,
}) => {
  await page.goto("/#/calendar?view=day&date=2026-08-01");
  await expect(
    page.getByText("Personal focus block", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("calendar-load-error")).toHaveCount(0);
  await expect(
    page.getByText("Agent planning block", { exact: true }),
  ).toHaveCount(0);

  const retry = page.getByRole("button", { name: "Retry nadia" });
  await expect(retry).toBeVisible({ timeout: 12_000 });
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(
    page.getByText("Agent planning block", { exact: true }),
  ).toBeVisible();
});

test("calendar load error is visible and Retry restores the calendar", async ({
  page,
}) => {
  await page.goto("/#/calendar?view=day&date=2026-08-01");
  const error = page.getByTestId("calendar-load-error");
  await expect(error).toContainText("Calendar couldn't be loaded", {
    timeout: 12_000,
  });
  await error.getByRole("button", { name: "Retry" }).click();
  await expect(error).toHaveCount(0);
  await expect(
    page.getByText("Agent planning block", { exact: true }),
  ).toBeVisible();
});

test("clicking a time creates a cancellable 30 minute draft", async ({
  page,
}) => {
  await page.goto("/#/calendar?view=week&date=2026-08-01");
  const column = page.getByTestId("calendar-day-column-2026-07-27");
  const bounds = await column.boundingBox();
  const gridBounds = await page.getByTestId("calendar-week-view").boundingBox();
  if (!bounds || !gridBounds) throw new Error("Calendar column has no bounds");
  await page.mouse.click(bounds.x + bounds.width / 2, gridBounds.y + 160);
  const dialog = page.getByTestId("calendar-event-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("calendar-draft-block")).toBeVisible();
  const start = await dialog.getByLabel("Start time").inputValue();
  const end = await dialog.getByLabel("End time").inputValue();
  expect(new Date(end).getTime() - new Date(start).getTime()).toBe(30 * 60_000);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId("calendar-draft-block")).toHaveCount(0);
});

test("dragging snaps a draft to quarter-hour boundaries", async ({ page }) => {
  await page.goto("/#/calendar?view=day&date=2026-08-01");
  const column = page.getByTestId("calendar-day-column-2026-08-01");
  const bounds = await column.boundingBox();
  const gridBounds = await page.getByTestId("calendar-day-view").boundingBox();
  if (!bounds || !gridBounds) throw new Error("Calendar column has no bounds");
  await page.mouse.move(bounds.x + bounds.width / 2, gridBounds.y + 96);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2, gridBounds.y + 192);
  await page.mouse.up();
  const dialog = page.getByTestId("calendar-event-dialog");
  await expect(dialog).toBeVisible();
  const start = new Date(await dialog.getByLabel("Start time").inputValue());
  const end = new Date(await dialog.getByLabel("End time").inputValue());
  expect(start.getMinutes() % 15).toBe(0);
  expect(end.getMinutes() % 15).toBe(0);
  expect(end.getTime() - start.getTime()).toBeGreaterThan(30 * 60_000);
});
