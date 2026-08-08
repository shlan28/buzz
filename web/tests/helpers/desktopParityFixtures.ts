import type { Page } from "@playwright/test";

export async function installWorkConsoleFixture(page: Page) {
  await page.addInitScript(() => {
    const userPubkey = "11".repeat(32);
    window.__BUZZ_E2E_PUBLISH_CHANNEL_MESSAGE__ = async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      return "e2e-published-message";
    };
    window.__BUZZ_E2E_WORK_CONSOLE_DATA__ = {
      userPubkey,
      channels: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          name: "general",
          about: "General discussion",
          channelType: "stream",
          visibility: "open",
          participantPubkeys: [],
          isMember: true,
          archivedAt: null,
          displayName: "general",
          updatedAt: 1_754_640_400,
        },
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Hermes",
          about: "Direct message with Hermes",
          channelType: "dm",
          visibility: "private",
          participantPubkeys: [userPubkey, "22".repeat(32)],
          isMember: true,
          archivedAt: null,
          displayName: "Hermes",
          updatedAt: 1_754_640_401,
        },
      ],
      messages: [
        {
          id: "message-1",
          kind: 9,
          tags: [["h", "00000000-0000-4000-8000-000000000001"]],
          channelId: "00000000-0000-4000-8000-000000000001",
          author: userPubkey,
          content: "Fixture message from Buzz",
          createdAt: 1_754_640_400,
        },
        {
          id: "message-2",
          kind: 40_002,
          tags: [
            ["h", "11111111-1111-4111-8111-111111111111"],
            ["p", userPubkey],
          ],
          channelId: "11111111-1111-4111-8111-111111111111",
          author: "22".repeat(32),
          content:
            "## Agent update\n\n- **Done**\n- `pnpm test`\n\n[Safe link](https://example.com) [Unsafe](javascript:alert(1))",
          createdAt: 1_754_640_401,
        },
        ...Array.from({ length: 36 }, (_, index) => ({
          id: `message-history-${index}`,
          kind: 40_002,
          tags: [
            ["h", "11111111-1111-4111-8111-111111111111"],
            ["p", userPubkey],
          ],
          channelId: "11111111-1111-4111-8111-111111111111",
          author: "22".repeat(32),
          content: `History message ${index + 1}`,
          createdAt: 1_754_640_402 + index,
        })),
      ],
      currentProfile: {
        pubkey: userPubkey,
        displayName: "鹿鹿子大王",
        name: "lulu",
        avatarUrl: null,
        nip05Handle: null,
        isAgent: false,
        updatedAt: 1_754_640_400,
      },
      profilesByPubkey: {
        [userPubkey]: {
          pubkey: userPubkey,
          displayName: "鹿鹿子大王",
          name: "lulu",
          avatarUrl: null,
          nip05Handle: null,
          isAgent: false,
          updatedAt: 1_754_640_400,
        },
        ["22".repeat(32)]: {
          pubkey: "22".repeat(32),
          displayName: "Hermes",
          name: "hermes",
          avatarUrl:
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23883fd1'/%3E%3C/svg%3E",
          nip05Handle: null,
          isAgent: true,
          updatedAt: 1_754_640_400,
        },
        ["33".repeat(32)]: {
          pubkey: "33".repeat(32),
          displayName: "Codex",
          name: "codex",
          avatarUrl: null,
          nip05Handle: null,
          isAgent: true,
          updatedAt: 1_754_640_400,
        },
      },
      membersByChannelId: {
        "00000000-0000-4000-8000-000000000001": [
          userPubkey,
          "22".repeat(32),
          "33".repeat(32),
        ],
        "11111111-1111-4111-8111-111111111111": [userPubkey, "22".repeat(32)],
      },
      calendar: [
        {
          id: "event-1",
          title: "Agent review",
          description: "Review progress",
          start: new Date("2026-08-08T10:00:00Z"),
          allDay: false,
          author: userPubkey,
          updatedAt: 1_754_640_400,
        },
      ],
      tasks: [
        {
          id: "task-1",
          title: "Ship iPad console",
          description: "Complete the read-only work console",
          status: "in-progress",
          priority: "high",
          assignee: "22".repeat(32),
          due: new Date("2026-08-15T23:59:59Z"),
          trackId: "track-1",
          labels: ["web", "ipad", "launch"],
          archived: false,
          updatedAt: 1_754_640_400,
        },
        {
          id: "task-2",
          title: "Untracked follow-up",
          description: "",
          status: "todo",
          priority: "none",
          labels: [],
          archived: false,
          updatedAt: 1_754_640_401,
        },
      ],
      tracks: [
        {
          id: "track-1",
          name: "Web launch",
          description: "Public PWA delivery",
          owner: userPubkey,
          members: [],
          startDate: "2026-08-01",
          endDate: "2026-08-31",
          status: "active",
          archived: false,
          updatedAt: 1_754_640_400,
        },
      ],
    };
  });
}
