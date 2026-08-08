import type { Page } from "@playwright/test";

export async function installWorkConsoleFixture(page: Page) {
  await page.addInitScript(() => {
    const userPubkey = "11".repeat(32);
    window.__BUZZ_E2E_WORK_CONSOLE_DATA__ = {
      userPubkey,
      channels: [
        {
          id: "general-id",
          name: "general",
          about: "General discussion",
          updatedAt: 100,
        },
      ],
      messages: [
        {
          id: "message-1",
          channelId: "general-id",
          author: userPubkey,
          content: "Fixture message from Buzz",
          createdAt: 100,
        },
      ],
      calendar: [
        {
          id: "event-1",
          title: "Agent review",
          description: "Review progress",
          start: new Date("2026-08-08T10:00:00Z"),
          allDay: false,
          author: userPubkey,
          updatedAt: 100,
        },
      ],
      tasks: [
        {
          id: "task-1",
          title: "Ship iPad console",
          description: "Complete the read-only work console",
          status: "in-progress",
          priority: "high",
          labels: ["web"],
          archived: false,
          updatedAt: 100,
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
          updatedAt: 100,
        },
      ],
    };
  });
}
