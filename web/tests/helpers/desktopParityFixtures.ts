import type { Page } from "@playwright/test";

export async function installWorkConsoleFixture(page: Page) {
  await page.addInitScript(() => {
    const userPubkey = "11".repeat(32);
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
          updatedAt: 1_754_640_400,
        },
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Hermes",
          about: "Direct message with Hermes",
          channelType: "dm",
          visibility: "private",
          participantPubkeys: [userPubkey, "22".repeat(32)],
          updatedAt: 1_754_640_401,
        },
      ],
      messages: [
        {
          id: "message-1",
          channelId: "00000000-0000-4000-8000-000000000001",
          author: userPubkey,
          content: "Fixture message from Buzz",
          createdAt: 1_754_640_400,
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
          labels: ["web"],
          archived: false,
          updatedAt: 1_754_640_400,
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
