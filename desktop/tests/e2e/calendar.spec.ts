import { expect, test } from "@playwright/test";
import type { RelayEvent } from "../../src/shared/api/types";
import { installMockBridge } from "../helpers/bridge";

const OTHER_RELAY_AGENT =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const DAILY_ASSISTANT =
  "5af288a37bbe8039ac36a36fba24d2324f2b5af60ff5d83492d6ca9bff98c33e";
const MOCK_OWNER = "deadbeef".repeat(8);

function dailyAssistantEvent(
  id: string,
  title: string,
  hour: number,
): RelayEvent {
  const start = Math.floor(new Date(2026, 7, 2, hour, 0).getTime() / 1_000);
  return {
    id: `mock-daily-${id}`,
    pubkey: DAILY_ASSISTANT,
    created_at: start - 60,
    kind: 31923,
    tags: [
      ["d", id],
      ["title", title],
      ["start", String(start)],
      ["end", String(start + 3_600)],
      ["start_tzid", Intl.DateTimeFormat().resolvedOptions().timeZone],
      ["end_tzid", Intl.DateTimeFormat().resolvedOptions().timeZone],
    ],
    content: "Created by daily-assistant.",
    sig: "mocksig".repeat(20).slice(0, 128),
  };
}

test.beforeEach(async ({ page }, testInfo) => {
  await installMockBridge(page, {
    managedAgents: [
      {
        pubkey: DAILY_ASSISTANT,
        name: "daily-assistant",
      },
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
        pubkey: DAILY_ASSISTANT,
        displayName: "daily-assistant",
        ownerPubkey: MOCK_OWNER,
        isAgent: true,
      },
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
    calendarDeleteSideEffectDelayMs: testInfo.title.includes(
      "delete stays removed",
    )
      ? 1_000
      : undefined,
    calendarDeleteErrors: testInfo.title.includes("delete failure restores")
      ? ["mock calendar deletion rejected"]
      : undefined,
    calendarPublishErrors: testInfo.title.includes("partial recurring failure")
      ? [null, "mock recurring publish rejected"]
      : undefined,
    calendarSubscriptionActive: testInfo.title.includes(
      "subscription lifecycle",
    ),
    calendarSubscriptionErrors: testInfo.title.includes(
      "subscription status failure",
    )
      ? ["mock subscription unavailable"]
      : undefined,
    calendarEvents: [
      dailyAssistantEvent("daily-bp", "提交BP到连尚网络", 10),
      dailyAssistantEvent("daily-liuli", "联系刘力", 11),
      dailyAssistantEvent("daily-moma", "联系MOMA展览 舒总", 13),
    ],
  });
});

test("creates a private subscription and never reveals it after reopening", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/#/calendar?view=day&date=2026-08-01");
  await page.getByTestId("calendar-subscription-trigger").click();
  const dialog = page.getByTestId("calendar-subscription-dialog");
  await expect(dialog).toContainText("Treat it like a password");
  await dialog.getByRole("button", { name: "Create private link" }).click();
  await expect(dialog).toContainText("Your private subscription link is ready");
  await expect(dialog).not.toContainText("e2e-private-calendar-token");
  await dialog.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Copied" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("e2e-private-calendar-token-1.ics");
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.getByTestId("calendar-subscription-trigger").click();
  await expect(dialog).toContainText(
    "full private link is no longer available",
  );
  await expect(dialog).not.toContainText("e2e-private-calendar-token");
});

test("subscription lifecycle regenerates and revokes with confirmation", async ({
  page,
}) => {
  await page.goto("/#/calendar?view=day&date=2026-08-01");
  await page.getByTestId("calendar-subscription-trigger").click();
  const dialog = page.getByTestId("calendar-subscription-dialog");
  await expect(dialog).toContainText("Active");
  await dialog.getByRole("button", { name: "Generate new link" }).click();
  const confirmation = page.getByRole("alertdialog");
  await confirmation.getByRole("button", { name: "Generate new link" }).click();
  await expect(dialog).toContainText("private subscription link is ready");
  await dialog.getByRole("button", { name: "Done" }).click();

  await page.getByTestId("calendar-subscription-trigger").click();
  await dialog.getByRole("button", { name: "Revoke link" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Revoke link" })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Create private link" }),
  ).toBeVisible();
});

test("subscription status failure offers an in-dialog retry", async ({
  page,
}) => {
  await page.goto("/#/calendar?view=day&date=2026-08-01");
  await page.getByTestId("calendar-subscription-trigger").click();
  const dialog = page.getByTestId("calendar-subscription-dialog");
  await expect(dialog).toContainText("Subscription status couldn't be loaded", {
    timeout: 15_000,
  });
  await dialog.getByRole("button", { name: "Retry" }).click();
  await expect(
    dialog.getByRole("button", { name: "Create private link" }),
  ).toBeVisible();
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
  const dailyAssistant = page.getByRole("checkbox", {
    name: "Show daily-assistant",
  });
  await expect(personal).toBeChecked();
  await expect(agent).toBeChecked();
  await expect(dailyAssistant).toBeChecked();
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

test("managed-only daily-assistant source shows its three historical events", async ({
  page,
}) => {
  await page.goto("/#/calendar?view=day&date=2026-08-02");
  await expect(
    page.getByRole("checkbox", { name: "Show daily-assistant" }),
  ).toBeChecked();
  await expect(
    page.getByText("提交BP到连尚网络", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("联系刘力", { exact: true })).toBeVisible();
  await expect(
    page.getByText("联系MOMA展览 舒总", { exact: true }),
  ).toBeVisible();
});

test("delete stays removed while the relay side effect is delayed", async ({
  page,
}) => {
  await page.goto("/#/calendar?view=day&date=2026-08-01");
  const event = page.getByText("Personal focus block", { exact: true });
  await event.click();
  await page
    .getByTestId("calendar-event-details")
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByTestId("calendar-event-details")).toHaveCount(0);
  await expect(event).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __BUZZ_E2E_CALENDAR_DELETE_COUNT__?: number;
            }
          ).__BUZZ_E2E_CALENDAR_DELETE_COUNT__ ?? 0,
      ),
    )
    .toBe(1);
  await page.waitForTimeout(1_100);
  await page.reload();
  await expect(event).toHaveCount(0);
});

test("delete failure restores the event and shows the relay error", async ({
  page,
}) => {
  await page.goto("/#/calendar?view=day&date=2026-08-01");
  const event = page.getByText("Personal focus block", { exact: true });
  await event.click();
  const details = page.getByTestId("calendar-event-details");
  await details.getByRole("button", { name: "Delete" }).click();
  await expect(details.getByRole("alert")).toContainText(
    "mock calendar deletion rejected",
  );
  await details.getByRole("button", { name: "Close" }).click();
  await expect(event).toBeVisible();
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

test("custom weekdays can remove Sunday and begin on Monday", async ({
  page,
}) => {
  await page.goto("/#/calendar?view=week&date=2026-08-02");
  await page.getByRole("button", { name: "Create event" }).click();
  const dialog = page.getByTestId("calendar-event-dialog");
  await dialog.getByLabel("Event title").fill("Workout plan");
  await dialog.getByRole("button", { name: "More options" }).click();
  await dialog.getByLabel("Repeat").selectOption("weekdays");
  await expect(dialog.getByLabel("Sun")).toBeChecked();
  await dialog.getByLabel("Sun").uncheck();
  await dialog.getByLabel("Mon").check();
  await dialog.getByLabel("Wed").check();
  await dialog.getByLabel("Occurrences").fill("3");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  const events = await page.evaluate(() =>
    (window.__BUZZ_E2E_SIGNED_EVENTS__ ?? []).filter(
      (event) => event.kind === 31923,
    ),
  );
  expect(events).toHaveLength(3);
  expect(
    events.map(
      (event) => event.tags.find((tag) => tag[0] === "buzz_occurrence")?.[1],
    ),
  ).toEqual(["0", "1", "2"]);
  expect(
    events[0]?.tags.find((tag) => tag[0] === "buzz_repeat_values")?.[1],
  ).toBe("1,3");
  expect(
    new Date(
      Number(events[0]?.tags.find((tag) => tag[0] === "start")?.[1]) * 1_000,
    ).getDay(),
  ).toBe(1);
});

test("monthly date combinations expose skipped-date semantics", async ({
  page,
}) => {
  await page.goto("/#/calendar?view=month&date=2026-01-31");
  await page.getByRole("button", { name: "Create event" }).click();
  const dialog = page.getByTestId("calendar-event-dialog");
  await dialog.getByLabel("Event title").fill("Month end review");
  await dialog.getByRole("button", { name: "More options" }).click();
  await dialog.getByLabel("Repeat").selectOption("month-days");
  await expect(dialog).toContainText("Dates absent from a month are skipped.");
  await dialog.getByLabel("Occurrences").fill("2");
  await dialog.getByRole("button", { name: "Save" }).click();
  const starts = await page.evaluate(() =>
    (window.__BUZZ_E2E_SIGNED_EVENTS__ ?? [])
      .filter((event) => event.kind === 31923)
      .map((event) =>
        Number(event.tags.find((tag) => tag[0] === "start")?.[1]),
      ),
  );
  expect(starts).toHaveLength(2);
  expect(new Date(starts[0] * 1_000).getDate()).toBe(31);
  expect(new Date(starts[1] * 1_000).getMonth()).toBe(2);
});

test("partial recurring failure reports progress", async ({ page }) => {
  await page.goto("/#/calendar?view=week&date=2026-08-03");
  await page.getByRole("button", { name: "Create event" }).click();
  const dialog = page.getByTestId("calendar-event-dialog");
  await dialog.getByLabel("Event title").fill("Daily checkpoint");
  await dialog.getByRole("button", { name: "More options" }).click();
  await dialog.getByLabel("Repeat").selectOption("daily");
  await dialog.getByLabel("Occurrences").fill("3");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Saved 1/3 occurrences",
  );
  await expect(dialog).toBeVisible();
});
