import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const ALLOWED_AVATAR_ORIGIN =
  "https://xianghuzuoyongli.oss-cn-beijing.aliyuncs.com";

test("restricts external avatars to the approved OSS origin", async () => {
  const headers = await readFile(
    new URL("../../public/_headers", import.meta.url),
    "utf8",
  );
  const contentSecurityPolicy = headers
    .split("\n")
    .find((line) => line.trim().startsWith("Content-Security-Policy:"));

  expect(contentSecurityPolicy).toBeDefined();
  const imageSources = contentSecurityPolicy
    ?.match(/(?:^|;)\s*img-src\s+([^;]+)/)?.[1]
    .trim()
    .split(/\s+/);

  expect(imageSources).toEqual([
    "'self'",
    "data:",
    "blob:",
    ALLOWED_AVATAR_ORIGIN,
  ]);
  expect(imageSources).not.toContain("https:");
  expect(imageSources).not.toContain("*");
});

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
  await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible();
});

test("work destinations are enabled", async ({ page }) => {
  await page.goto("/app/channels");

  await expect(page.getByText("Calendar")).toBeVisible();
  await expect(page.getByText("Tasks")).toBeVisible();
  await expect(page.getByText("Tracks")).toBeVisible();
  await expect(page.getByRole("link", { name: "Calendar" })).toHaveAttribute(
    "href",
    "/app/calendar",
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

test("opens the secure Mac pairing flow", async ({ page }) => {
  await page.goto("/app/channels");
  await page.getByRole("link", { name: "Open Pairing" }).click();

  await expect(page).toHaveURL(/\/app\/pair$/);
  await expect(
    page.getByRole("heading", { name: "Connect this browser" }),
  ).toBeVisible();
  await expect(page.getByLabel("Desktop pairing link")).toBeVisible();
  await expect(
    page.getByText(/private key never enters the browser/i),
  ).toBeVisible();
});
