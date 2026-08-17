import { expect, test } from "@playwright/test";

import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

const PERSONA_ID = "custom:owner-reply-isolation";
const PRIMARY_PUBKEY = TEST_IDENTITIES.alice.pubkey;
const SECONDARY_PUBKEY = TEST_IDENTITIES.charlie.pubkey;

async function openInstanceEdit(page: import("@playwright/test").Page) {
  await page.getByTestId("user-profile-edit-agent").click();
  await expect(page.getByTestId("edit-agent-dialog")).toBeVisible();
  await expect(
    page.getByTestId("edit-agent-owner-message-reply"),
  ).toBeInViewport();
}

const ownerReplySwitch = (page: import("@playwright/test").Page) =>
  page.getByRole("switch", {
    name: "Reply to my messages without an @mention",
  });

async function ownerReplySetting(
  page: import("@playwright/test").Page,
  pubkey: string,
) {
  return page.evaluate(async (agentPubkey) => {
    const agents = await window.__TAURI_INTERNALS__.invoke<
      Array<{ pubkey: string; respond_to_owner_messages: boolean }>
    >("list_managed_agents");
    return agents.find((agent) => agent.pubkey === agentPubkey)
      ?.respond_to_owner_messages;
  }, pubkey);
}

test("owner-message reply setting is isolated per Agent instance", async ({
  page,
}) => {
  await installMockBridge(page, {
    personas: [
      {
        id: PERSONA_ID,
        displayName: "Owner Reply Auditor",
        systemPrompt: "Audit instance-level owner replies.",
      },
    ],
    managedAgents: [
      {
        pubkey: PRIMARY_PUBKEY,
        name: "Owner Reply Auditor A",
        personaId: PERSONA_ID,
        status: "running",
      },
      {
        pubkey: SECONDARY_PUBKEY,
        name: "Owner Reply Auditor B",
        personaId: PERSONA_ID,
        status: "stopped",
      },
    ],
    globalAgentConfig: {
      env_vars: { ANTHROPIC_API_KEY: "sk-ant-test" },
      provider: "anthropic",
      model: "claude-opus-4-5",
    },
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("open-agents-view").click();
  await page.getByTestId(`persona-agent-row-${PERSONA_ID}`).click();

  // A linked single/profile instance must open the instance dialog, not the
  // Persona definition dialog. Enable only the primary instance.
  await openInstanceEdit(page);
  await expect(ownerReplySwitch(page)).not.toBeChecked();
  await ownerReplySwitch(page).click();
  await page.getByTestId("edit-agent-dialog-submit").click();
  await expect(page.getByTestId("edit-agent-dialog")).not.toBeVisible();

  // Verify the persisted records directly: changing A must not overwrite the
  // sibling instance B. The profile panel closes after an instance update in
  // the current shell, so persistence is the authoritative isolation check.
  await expect.poll(() => ownerReplySetting(page, PRIMARY_PUBKEY)).toBe(true);
  await expect
    .poll(() => ownerReplySetting(page, SECONDARY_PUBKEY))
    .toBe(false);
});
