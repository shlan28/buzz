import type { Page } from "@playwright/test";

export async function waitForAnimations(page: Page) {
  await page.evaluate(async () => {
    const animations = document.getAnimations();
    await Promise.race([
      Promise.all(
        animations.map((animation) =>
          animation.finished.catch(() => undefined),
        ),
      ),
      new Promise((resolve) => window.setTimeout(resolve, 1_000)),
    ]);
  });
}
