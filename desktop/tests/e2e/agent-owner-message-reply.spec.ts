import { expect, test } from "@playwright/test";

import { installMockBridge } from "../helpers/bridge";

async function listPersonas(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (!invoke) throw new Error("mock invoke bridge unavailable");
    return invoke<Array<{ id: string; respond_to_owner_messages?: boolean }>>(
      "list_personas",
    );
  });
}

test("Agent card Edit persists the owner-message reply switch", async ({
  page,
}) => {
  await installMockBridge(page, {
    activePersonaIds: ["builtin:fizz"],
    globalAgentConfig: {
      env_vars: { ANTHROPIC_API_KEY: "sk-ant-test" },
      provider: "anthropic",
      model: "claude-opus-4-5",
    },
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("open-agents-view")).toBeVisible();
  await page.getByTestId("open-agents-view").click();

  const openEdit = async () => {
    await page.getByLabel("Open actions for Fizz").click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
  };
  const ownerReplySwitch = () =>
    page.getByRole("switch", {
      name: "Reply to my messages without an @mention",
    });

  await openEdit();
  await expect(ownerReplySwitch()).not.toBeChecked();
  await ownerReplySwitch().click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("persona-dialog")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await listPersonas(page)).find(({ id }) => id === "builtin:fizz")
          ?.respond_to_owner_messages,
    )
    .toBe(true);

  await openEdit();
  await expect(ownerReplySwitch()).toBeChecked();
  await ownerReplySwitch().click();
  await page.getByRole("button", { name: "Save changes" }).click();

  await openEdit();
  await expect(ownerReplySwitch()).not.toBeChecked();
});
