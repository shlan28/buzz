import { expect, test } from "@playwright/test";

test("PWA metadata and Desktop-parity shell are present", async ({ page }) => {
  await page.goto("/app/channels");

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(page.getByTestId("desktop-parity-app-shell")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Channels" })).toBeVisible();
});

test("work destinations remain visible while unfinished destinations are disabled", async ({
  page,
}) => {
  await page.goto("/app/channels");

  await expect(page.getByText("Calendar")).toBeVisible();
  await expect(page.getByText("Tasks")).toBeVisible();
  await expect(page.getByText("Tracks")).toBeVisible();
  await expect(page.getByText("Calendar").locator("..")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("matches the Desktop chrome geometry", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/app/channels");

  await expect(page.getByTestId("app-top-chrome")).toHaveCSS("height", "40px");
  await expect(page.getByTestId("app-sidebar")).toHaveCSS("width", "300px");

  const surface = page.getByTestId("content-surface");
  await expect(surface).toHaveCSS("border-radius", "16px");
  await expect(surface).toHaveCSS("margin-top", "1px");
  await expect(surface).toHaveCSS("margin-right", "8px");
  await expect(surface).toHaveCSS("margin-bottom", "8px");
  await expect(surface).toHaveCSS("margin-left", "1px");
});

test("keeps the Desktop visual language on compact iPad layouts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto("/app/channels");

  await expect(page.getByTestId("app-top-chrome")).toHaveCSS("height", "40px");
  await expect(page.getByTestId("app-sidebar")).toHaveCSS("width", "48px");
  await expect(page.getByTestId("content-surface")).toHaveCSS(
    "border-radius",
    "16px",
  );
  await expect(page.locator("body")).toHaveCSS("overflow-x", "hidden");
});
