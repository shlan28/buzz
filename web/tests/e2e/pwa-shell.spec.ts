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
