import { expect, test } from "@playwright/test";
import { installMockBridge } from "../helpers/bridge";

test.beforeEach(async ({ page }) => {
  await installMockBridge(page);
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

test("clicking a time creates a cancellable 30 minute draft", async ({
  page,
}) => {
  await page.goto("/#/calendar?view=week&date=2026-08-01");
  const column = page.getByTestId("calendar-day-column-2026-07-27");
  const bounds = await column.boundingBox();
  if (!bounds) throw new Error("Calendar column has no bounds");
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + 160);
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
  if (!bounds) throw new Error("Calendar column has no bounds");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 96);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 192);
  await page.mouse.up();
  const dialog = page.getByTestId("calendar-event-dialog");
  await expect(dialog).toBeVisible();
  const start = new Date(await dialog.getByLabel("Start time").inputValue());
  const end = new Date(await dialog.getByLabel("End time").inputValue());
  expect(start.getMinutes() % 15).toBe(0);
  expect(end.getMinutes() % 15).toBe(0);
  expect(end.getTime() - start.getTime()).toBeGreaterThan(30 * 60_000);
});
