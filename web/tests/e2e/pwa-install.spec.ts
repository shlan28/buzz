import { expect, test } from "@playwright/test";

test("manifest is installable and service worker excludes identity data", async ({
  page,
  request,
}) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.start_url).toBe("/app/channels");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.length).toBeGreaterThan(0);
  const worker = await (await request.get("/sw.js")).text();
  expect(worker).not.toMatch(/indexedDB|buzz-device-credentials|nsec/i);
  await page.goto("/app/channels");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
});
