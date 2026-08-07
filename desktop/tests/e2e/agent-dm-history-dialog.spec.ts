import { expect, test } from "@playwright/test";

import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

async function waitForLiveSubscription(page: import("@playwright/test").Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__BUZZ_E2E_HAS_MOCK_LIVE_SUBSCRIPTION__?.({
            channelName: "alice-tyler",
          }) ?? false,
      ),
    )
    .toBe(true);
}

test("Agent DM history opens in an isolated dialog and searches the selected range", async ({
  page,
}) => {
  await installMockBridge(page, {
    managedAgents: [
      {
        pubkey: TEST_IDENTITIES.alice.pubkey,
        name: "Alice Agent",
        status: "stopped",
      },
    ],
  });
  await page.goto("/");
  await page.getByTestId("channel-alice-tyler").click();
  await waitForLiveSubscription(page);

  await page.evaluate((agentPubkey) => {
    window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
      channelName: "alice-tyler",
      content: "历史测试消息：Relay 已恢复。",
      pubkey: agentPubkey,
    });
  }, TEST_IDENTITIES.alice.pubkey);
  await expect(page.getByText("历史测试消息：Relay 已恢复。")).toBeVisible();

  await page.getByRole("button", { name: "查看历史" }).click();
  const dialog = page.getByTestId("agent-dm-history-dialog");
  await expect(dialog).toBeVisible();
  await expect
    .poll(async () => (await dialog.boundingBox())?.width ?? 0)
    .toBeGreaterThan(800);

  await dialog.getByRole("button", { name: "查看", exact: true }).click();
  await expect(dialog.getByText("历史测试消息：Relay 已恢复。")).toBeVisible();

  await dialog.getByLabel("搜索历史消息内容").fill("历史测试");
  await dialog.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(dialog.getByText("找到 1 条相关消息")).toBeVisible();
  await expect(dialog.getByText("历史测试消息：Relay 已恢复。")).toBeVisible();

  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("历史测试消息：Relay 已恢复。")).toBeVisible();

  await page.getByTestId("channel-bob-tyler").click();
  await expect(page.getByRole("button", { name: "查看历史" })).toHaveCount(0);
});
