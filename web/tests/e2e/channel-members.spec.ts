import { expect, test } from "@playwright/test";
import { buildChannelMemberViews } from "@/features/channels/channelMembers";
import { installWorkConsoleFixture } from "../helpers/desktopParityFixtures";

const user = "11".repeat(32);
const agent = "22".repeat(32);

test("deduplicates, sorts, and searches authoritative Channel members", () => {
  const rows = buildChannelMemberViews({
    currentPubkey: user,
    members: [
      { pubkey: agent, role: "bot" },
      { pubkey: user, role: "owner" },
      { pubkey: agent, role: "bot" },
    ],
    profiles: {
      [agent]: {
        pubkey: agent,
        displayName: "Hermes",
        name: "hermes",
        avatarUrl: null,
        nip05Handle: null,
        isAgent: true,
        updatedAt: 1,
      },
    },
  });
  expect(rows.map((row) => row.label)).toEqual(["You", "Hermes"]);
  expect(rows[1]).toMatchObject({ isAgent: true, role: "bot" });
  expect(
    buildChannelMemberViews({
      currentPubkey: user,
      members: rows,
      profiles: {},
      query: "agent",
    }).map((row) => row.pubkey),
  ).toEqual([agent]);
});

test("keeps role priority ahead of You while preferring You within a role", () => {
  const admin = "33".repeat(32);
  const rows = buildChannelMemberViews({
    currentPubkey: user,
    members: [
      { pubkey: user, role: "member" },
      { pubkey: agent, role: "member" },
      { pubkey: admin, role: "admin" },
    ],
    profiles: {},
  });
  expect(rows.map((row) => row.pubkey)).toEqual([admin, user, agent]);
});

test("opens a read-only member panel and filters members", async ({ page }) => {
  await installWorkConsoleFixture(page);
  await page.goto("/app/channels/00000000-0000-4000-8000-000000000001");
  await page.getByRole("button", { name: "View channel members (3)" }).click();
  const panel = page.getByTestId("channel-members-panel");
  await expect(panel).toContainText("You");
  await expect(panel).toContainText("Hermes");
  await expect(panel).toContainText("Codex");
  await panel
    .getByRole("textbox", { name: "Search channel members" })
    .fill("agent");
  await expect(panel).toContainText("Hermes");
  await expect(panel).toContainText("Codex");
  await expect(
    panel.getByRole("button", { name: /add|remove|manage|edit/i }),
  ).toHaveCount(0);
  await panel.getByRole("button", { name: "Close channel members" }).click();
  await expect(panel).toHaveCount(0);

  await page.getByRole("button", { name: "View channel members (3)" }).click();
  await page.getByRole("link", { name: "Hermes" }).click();
  await expect(page.getByTestId("channel-members-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "View channel members (2)" }).click();
  const dmPanel = page.getByTestId("channel-members-panel");
  await expect(dmPanel).toContainText("Hermes");
  await expect(dmPanel).not.toContainText("Codex");
});
