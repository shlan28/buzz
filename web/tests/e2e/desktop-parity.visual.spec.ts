import { expect, test } from "@playwright/test";
import { waitForAnimations } from "../helpers/animations";
import { installWorkConsoleFixture } from "../helpers/desktopParityFixtures";

test.beforeEach(async ({ page }) => installWorkConsoleFixture(page));

for (const theme of ["light", "dark"] as const) {
  test(`keeps the desktop shell geometry and ${theme} appearance`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`/app/channels?previewTheme=${theme}`);
    await expect(page.getByTestId("app-top-chrome")).toHaveCSS(
      "height",
      "40px",
    );
    await expect(page.getByTestId("app-sidebar")).toHaveCSS("width", "300px");
    await expect(page.getByTestId("content-surface")).toHaveCSS(
      "border-radius",
      "16px",
    );
    await waitForAnimations(page);
    await expect(page.getByTestId("desktop-parity-app-shell")).toHaveScreenshot(
      `desktop-shell-${theme}.png`,
      { animations: "disabled", maxDiffPixelRatio: 0.005 },
    );
  });

  for (const view of [
    { name: "track-detail", path: "/app/tracks/track-1" },
    { name: "inbox-detail", path: "/app/inbox?item=message-2" },
  ]) {
    test(`keeps the ${view.name} ${theme} appearance`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      const separator = view.path.includes("?") ? "&" : "?";
      await page.goto(`${view.path}${separator}previewTheme=${theme}`);
      await waitForAnimations(page);
      await expect(page.getByTestId("content-surface")).toHaveScreenshot(
        `${view.name}-${theme}.png`,
        { animations: "disabled", maxDiffPixelRatio: 0.005 },
      );
    });
  }

  test(`keeps the Channel members ${theme} appearance`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(
      `/app/channels/00000000-0000-4000-8000-000000000001?previewTheme=${theme}`,
    );
    await page
      .getByRole("button", { name: "View channel members (3)" })
      .click();
    await waitForAnimations(page);
    await expect(page.getByTestId("content-surface")).toHaveScreenshot(
      `channel-members-${theme}.png`,
      { animations: "disabled", maxDiffPixelRatio: 0.005 },
    );
  });
}
