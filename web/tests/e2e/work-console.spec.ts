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
  await page.getByRole("link", { name: "Inbox" }).click();
  await expect(page.getByTestId("inbox-screen")).toBeVisible();
  await page.getByRole("link", { name: "Calendar" }).click();
  await expect(page.getByText("Agent review")).toBeVisible();
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
    page
      .getByRole("complementary")
      .getByRole("heading", { name: "Web launch" }),
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

test("keeps all work views read-only", async ({ page }) => {
  for (const path of ["calendar", "tasks", "tracks"]) {
    await page.goto(`/app/${path}`);
    await expect(page.getByText(/Read only/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /create|delete|edit/i }),
    ).toHaveCount(0);
  }
});
