import { expect, test, type Page } from "@playwright/test";

import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

const GENERAL_CHANNEL_ID = "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50";
const AGENT_PUBKEY = TEST_IDENTITIES.tyler.pubkey;
const INBOX_AGENT_PUBKEY = TEST_IDENTITIES.alice.pubkey;

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

async function pushInboxMessage(
  page: Page,
  { content, id, pubkey }: { content: string; id: string; pubkey: string },
) {
  await page.waitForFunction(
    () =>
      typeof (window as Window & { __BUZZ_E2E_PUSH_MOCK_FEED_ITEM__?: unknown })
        .__BUZZ_E2E_PUSH_MOCK_FEED_ITEM__ === "function",
  );
  await page.evaluate(
    ({
      channelId,
      content: messageContent,
      currentPubkey,
      id: itemId,
      pubkey: authorPubkey,
    }) => {
      const pushFeedItem = (
        window as Window & {
          __BUZZ_E2E_PUSH_MOCK_FEED_ITEM__?: (
            item: Record<string, unknown>,
          ) => void;
        }
      ).__BUZZ_E2E_PUSH_MOCK_FEED_ITEM__;
      if (!pushFeedItem) throw new Error("Mock feed helper is not installed.");

      pushFeedItem({
        category: "mention",
        channel_id: channelId,
        channel_name: "general",
        content: messageContent,
        created_at: Math.floor(Date.now() / 1000),
        id: itemId,
        kind: 9,
        pubkey: authorPubkey,
        tags: [
          ["e", channelId],
          ["p", currentPubkey],
        ],
      });
    },
    {
      channelId: GENERAL_CHANNEL_ID,
      content,
      currentPubkey: TEST_IDENTITIES.tyler.pubkey,
      id,
      pubkey,
    },
  );
  await page.getByTestId(`home-inbox-item-${id}`).click();
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

test("agent Markdown paths inherit the global accent under Buzz", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("buzz-theme", "buzz");
    window.localStorage.setItem("buzz-accent-color", "#a855f7");
  });
  await installMockBridge(page, {
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
    content: "Review `PLANS/accent-preview.md`.",
  });
  await page.getByTestId("channel-general").click();

  const pathButton = page.getByRole("button", {
    name: "Preview Markdown file PLANS/accent-preview.md",
  });
  await expect(pathButton).toBeVisible();
  await expect
    .poll(() =>
      pathButton.evaluate((element) => getComputedStyle(element).color),
    )
    .toBe("rgb(168, 85, 247)");
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

test("Inbox agent Markdown paths open the local preview", async ({ page }) => {
  await installMockBridge(page, {
    localMarkdownPreview: {
      content: "# Inbox preview\n\nAgent result from Inbox.",
      filename: "inbox-agent-plan.md",
      path: "/tmp/inbox-agent-plan.md",
    },
    managedAgents: [
      {
        channelIds: [GENERAL_CHANNEL_ID],
        channelNames: ["general"],
        name: "Alice Agent",
        pubkey: INBOX_AGENT_PUBKEY,
        status: "running",
      },
    ],
  });
  await page.goto("/");
  await pushInboxMessage(page, {
    content: "Review `/tmp/inbox-agent-plan.md`.",
    id: "inbox-agent-local-markdown",
    pubkey: INBOX_AGENT_PUBKEY,
  });

  const pathButton = page.getByRole("button", {
    name: "Preview Markdown file /tmp/inbox-agent-plan.md",
  });
  await expect(pathButton).toBeVisible();
  await pathButton.click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Inbox preview" }),
  ).toBeVisible();
});

test("Inbox ordinary member paths stay plain text", async ({ page }) => {
  await installMockBridge(page);
  await page.goto("/");
  await pushInboxMessage(page, {
    content: "/tmp/inbox-member-plan.md",
    id: "inbox-member-local-markdown",
    pubkey: TEST_IDENTITIES.outsider.pubkey,
  });

  await expect(
    page
      .getByTestId("home-inbox-selected-message")
      .getByText("/tmp/inbox-member-plan.md", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Preview Markdown file /tmp/inbox-member-plan.md",
    }),
  ).toHaveCount(0);
});

test("relative Agent Markdown paths resolve directly", async ({ page }) => {
  await installMockBridge(page, {
    localMarkdownPreview: {
      content: "# Relative preview",
      filename: "plan.md",
      path: "/Users/lu/.buzz/REPOS/buzz/docs/plan.md",
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
    content: "Review `docs/plan.md`.",
  });
  await page.getByTestId("channel-general").click();

  await page
    .getByRole("button", { name: "Preview Markdown file docs/plan.md" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Relative preview" }),
  ).toBeVisible();
});

test("multiple relative matches require a full-path choice", async ({
  page,
}) => {
  await installMockBridge(page, {
    localMarkdownMatches: [
      { filename: "README.md", path: "/Users/lu/.buzz/README.md" },
      {
        filename: "README.md",
        path: "/Users/lu/.buzz/REPOS/buzz/README.md",
      },
    ],
    localMarkdownPreview: {
      content: "# Chosen repository",
      filename: "README.md",
      path: "/Users/lu/.buzz/REPOS/buzz/README.md",
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
    content: "Review README.md.",
  });
  await page.getByTestId("channel-general").click();

  await page
    .getByRole("button", { name: "Preview Markdown file README.md" })
    .click();
  const chooser = page.getByRole("dialog", { name: "Choose Markdown file" });
  await expect(chooser).toBeVisible();
  await chooser
    .getByRole("button", {
      name: "README.md /Users/lu/.buzz/REPOS/buzz/README.md",
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Chosen repository" }),
  ).toBeVisible();
});

test("ordinary member relative paths stay plain text", async ({ page }) => {
  await installMockBridge(page);
  await page.goto("/");
  await invokeMock(page, "send_channel_message", {
    channelId: GENERAL_CHANNEL_ID,
    content: "README.md",
    tags: [],
  });
  await page.getByTestId("channel-general").click();

  await expect(page.getByText("README.md", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Preview Markdown file README.md",
    }),
  ).toHaveCount(0);
});

test("missing relative Markdown paths show a recoverable error", async ({
  page,
}) => {
  await installMockBridge(page, {
    localMarkdownPreviewError:
      "No matching Markdown file was found in the Agent workspace",
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
    content: "Review missing.md.",
  });
  await page.getByTestId("channel-general").click();

  await page
    .getByRole("button", { name: "Preview Markdown file missing.md" })
    .click();
  await expect(
    page.getByText(
      "No matching Markdown file was found in the Agent workspace",
    ),
  ).toBeVisible();
});
