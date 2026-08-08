import { expect, test } from "@playwright/test";
import { installWorkConsoleFixture } from "../helpers/desktopParityFixtures";

test.beforeEach(async ({ page }) => installWorkConsoleFixture(page));

test("renders real work-console views from one authenticated data model", async ({
  page,
}) => {
  await page.goto("/app/channels");
  await expect(page.getByText("Fixture message from Buzz")).toBeVisible();
  await page.getByRole("link", { name: "Calendar" }).click();
  await expect(page.getByText("Agent review")).toBeVisible();
  await page.getByRole("link", { name: "Tasks" }).click();
  await expect(page.getByText("Ship iPad console")).toBeVisible();
  await page.getByRole("link", { name: "Tracks" }).click();
  await expect(page.getByText("Web launch")).toBeVisible();
});

test("keeps all work views read-only", async ({ page }) => {
  for (const path of ["calendar", "tasks", "tracks"]) {
    await page.goto(`/app/${path}`);
    await expect(page.getByText(/Read only/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /create|delete|edit/i }),
    ).toHaveCount(0);
  }
});
