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
}
