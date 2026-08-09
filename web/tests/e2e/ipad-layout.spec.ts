import { expect, test } from "@playwright/test";
import { installWorkConsoleFixture } from "../helpers/desktopParityFixtures";

test.beforeEach(async ({ page }) => installWorkConsoleFixture(page));

for (const viewport of [
  { width: 1180, height: 820 },
  { width: 820, height: 1180 },
  { width: 600, height: 900 },
]) {
  test(`fits work console at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/app/tasks");
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await expect(page.getByTestId("content-surface")).toBeVisible();
    await expect(page.getByText("Ship iPad console")).toBeVisible();
  });
}

test("keeps Settings controls aligned on compact iPad", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Appearance" }).click();
  const buttons = page
    .getByTestId("appearance-mode-selector")
    .getByRole("button");
  await expect(buttons).toHaveCount(3);
  const boxes = await Promise.all(
    [0, 1, 2].map((index) => buttons.nth(index).boundingBox()),
  );
  expect(new Set(boxes.map((box) => Math.round(box?.y ?? -1))).size).toBe(1);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

for (const path of ["/app/tracks/track-1", "/app/inbox?item=message-2"]) {
  test(`keeps ${path} inside the iPad viewport`, async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto(path);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await expect(page.getByTestId("content-surface")).toBeVisible();
  });
}

for (const viewport of [
  { width: 1180, height: 820, compact: false },
  { width: 600, height: 900, compact: true },
]) {
  test(`fits Channel members at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/app/channels/00000000-0000-4000-8000-000000000001");
    await page
      .getByRole("button", { name: "View channel members (3)" })
      .click();
    const panel = page.getByTestId("channel-members-panel");
    await expect(panel).toBeVisible();
    const panelWidth = (await panel.boundingBox())?.width ?? 0;
    const contentWidth =
      (await page.getByTestId("content-surface").boundingBox())?.width ?? 0;
    expect(panelWidth).toBeCloseTo(viewport.compact ? contentWidth : 320, 0);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
}
