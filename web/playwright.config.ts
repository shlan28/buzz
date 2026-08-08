import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "smoke",
      testMatch: [
        "**/smoke.spec.ts",
        "**/pwa-shell.spec.ts",
        "**/pairing-crypto.spec.ts",
        "**/domain-codecs.spec.ts",
        "**/work-console.spec.ts",
        "**/pwa-install.spec.ts",
        "**/ipad-layout.spec.ts",
        "**/relay-session.spec.ts",
      ],
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "ipad-landscape",
      testMatch: [
        "**/pwa-shell.spec.ts",
        "**/work-console.spec.ts",
        "**/ipad-layout.spec.ts",
      ],
      use: {
        ...devices["iPad Pro 11 landscape"],
      },
    },
    {
      name: "ipad-portrait",
      testMatch: [
        "**/pwa-shell.spec.ts",
        "**/work-console.spec.ts",
        "**/ipad-layout.spec.ts",
      ],
      use: {
        ...devices["iPad Pro 11"],
      },
    },
  ],
  webServer: {
    command: "pnpm exec vite preview --port 4173 --strictPort --host 127.0.0.1",
    cwd: ".",
    reuseExistingServer: !process.env.CI,
    url: "http://127.0.0.1:4173",
  },
});
