import { expect, test, type Page } from "@playwright/test";

import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

const GENERAL_CHANNEL_ID = "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50";
const AGENT_PUBKEY = TEST_IDENTITIES.tyler.pubkey;

async function invokeMock(
  page: Page,
  command: string,
  payload: Record<string, unknown>,
) {
  await page.waitForFunction(
    () =>
      typeof (window as Window & { __BUZZ_E2E_INVOKE_MOCK_COMMAND__?: unknown })
        .__BUZZ_E2E_INVOKE_MOCK_COMMAND__ === "function",
  );
  await page.evaluate(
    ({ command: cmd, payload: args }) =>
      (
        window as Window & {
          __BUZZ_E2E_INVOKE_MOCK_COMMAND__: (
            command: string,
            payload: Record<string, unknown>,
          ) => Promise<unknown>;
        }
      ).__BUZZ_E2E_INVOKE_MOCK_COMMAND__(cmd, args),
    { command, payload },
  );
}

test("agent Markdown paths open a local read-only preview", async ({
  page,
}) => {
  await installMockBridge(page, {
    localMarkdownPreview: {
      content: "# Preview title\n\n- first\n- second",
      filename: "agent-plan.md",
      path: "/tmp/agent-plan.md",
    },
    managedAgents: [
      {
        channelIds: [GENERAL_CHANNEL_ID],
        channelNames: ["general"],
        name: "Tyler Agent",
        pubkey: AGENT_PUBKEY,
        status: "running",
      },
    ],
  });
  await page.goto("/");

  await invokeMock(page, "send_managed_agent_channel_message", {
    agentPubkey: AGENT_PUBKEY,
    channelId: GENERAL_CHANNEL_ID,
    content: "I wrote `/tmp/agent-plan.md` for review.",
  });
  await page.getByTestId("channel-general").click();

  const pathButton = page.getByRole("button", {
    name: "Preview Markdown file /tmp/agent-plan.md",
  });
  await expect(pathButton).toBeVisible();
  await pathButton.click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "agent-plan.md" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Preview title" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("first");
});

test("ordinary member paths stay plain text", async ({ page }) => {
  await installMockBridge(page);
  await page.goto("/");
  await invokeMock(page, "send_channel_message", {
    channelId: GENERAL_CHANNEL_ID,
    content: "/tmp/member-plan.md",
    tags: [],
  });
  await page.getByTestId("channel-general").click();

  await expect(
    page.getByText("/tmp/member-plan.md", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Preview Markdown file /tmp/member-plan.md",
    }),
  ).toHaveCount(0);
});
