import { expect, test } from "@playwright/test";
import {
  buildInboxEntries,
  messageThreadRoot,
  resolveInboxEntry,
} from "@/features/inbox/inboxProjection";
import { isDefaultPlaceholderAvatar } from "@/shared/ui/ProfileAvatar";
import type { WorkConsoleData } from "@/shared/api/communitySession";

const userPubkey = "11".repeat(32);
const agentPubkey = "22".repeat(32);
const channelId = "00000000-0000-4000-8000-000000000001";
const dmId = "11111111-1111-4111-8111-111111111111";

function data(): WorkConsoleData {
  return {
    userPubkey,
    relaySelfPubkey: "44".repeat(32),
    currentProfile: undefined,
    profilesByPubkey: {
      [agentPubkey]: {
        pubkey: agentPubkey,
        displayName: "Hermes",
        name: "hermes",
        avatarUrl: null,
        nip05Handle: null,
        isAgent: true,
        updatedAt: 1,
      },
    },
    membersByChannelId: {},
    channelMembersByChannelId: {},
    channels: [
      {
        id: channelId,
        name: "general",
        about: "",
        channelType: "stream",
        visibility: "open",
        participantPubkeys: [],
        isMember: true,
        archivedAt: null,
        displayName: "general",
        updatedAt: 1,
      },
      {
        id: dmId,
        name: "Hermes",
        about: "",
        channelType: "dm",
        visibility: "private",
        participantPubkeys: [userPubkey, agentPubkey],
        isMember: true,
        archivedAt: null,
        displayName: "Hermes",
        updatedAt: 1,
      },
    ],
    messages: [
      {
        id: "dm-1",
        kind: 40_002,
        tags: [["h", dmId]],
        channelId: dmId,
        author: agentPubkey,
        content: "First",
        createdAt: 1,
      },
      {
        id: "dm-2",
        kind: 40_002,
        tags: [["h", dmId]],
        channelId: dmId,
        author: agentPubkey,
        content: "Latest",
        createdAt: 2,
      },
      {
        id: "mention",
        kind: 9,
        tags: [
          ["h", channelId],
          ["p", userPubkey],
        ],
        channelId,
        author: agentPubkey,
        content: "**Look**",
        createdAt: 3,
      },
      {
        id: "reply",
        kind: 9,
        tags: [
          ["h", channelId],
          ["e", "root", "", "root"],
        ],
        channelId,
        author: agentPubkey,
        content: "Thread reply",
        createdAt: 4,
      },
      {
        id: "agent",
        kind: 40_002,
        tags: [["h", channelId]],
        channelId,
        author: agentPubkey,
        content: "Agent work",
        createdAt: 5,
      },
      {
        id: "channel",
        kind: 9,
        tags: [["h", channelId]],
        channelId,
        author: userPubkey,
        content: "Channel work",
        createdAt: 6,
      },
    ],
    calendar: [],
    tasks: [],
    taskExecutions: [],
    tracks: [],
  };
}

test("groups DMs and classifies Desktop-style Inbox conversations", () => {
  const entries = buildInboxEntries(data());
  expect(entries).toHaveLength(4);
  expect(entries.map((entry) => entry.categoryText)).toEqual([
    "Agent update in #general",
    "Thread in #general",
    "Mentioned in #general",
    "DM from Hermes",
  ]);
  const dm = entries.find((entry) => entry.category === "dm");
  expect(dm?.messages.map((message) => message.id)).toEqual(["dm-1", "dm-2"]);
  expect(resolveInboxEntry(entries, "dm-1")?.conversationId).toBe(`dm:${dmId}`);
});

test("excludes self-authored candidates but retains them in conversation context", () => {
  const fixture = data();
  fixture.messages.push({
    id: "dm-self-reply",
    kind: 9,
    tags: [["h", dmId]],
    channelId: dmId,
    author: userPubkey,
    content: "My reply",
    createdAt: 99,
  });
  const entries = buildInboxEntries(fixture);
  const dm = entries.find((entry) => entry.category === "dm");
  expect(dm?.authorLabel).toBe("Hermes");
  expect(dm?.preview).toBe("Latest");
  expect(dm?.messages.at(-1)?.id).toBe("dm-self-reply");
  expect(entries.some((entry) => entry.message.author === userPubkey)).toBe(
    false,
  );
});

test("reads NIP-10 roots and detects solid SVG placeholders", () => {
  expect(messageThreadRoot({ tags: [["e", "root-id", "", "root"]] })).toBe(
    "root-id",
  );
  expect(
    isDefaultPlaceholderAvatar(
      "data:image/svg+xml,%3Csvg%3E%3Crect%20width='32'%20height='32'/%3E%3C/svg%3E",
    ),
  ).toBe(true);
  expect(
    isDefaultPlaceholderAvatar(
      "data:image/svg+xml,%3Csvg%3E%3Crect/%3E%3Ctext%3EH%3C/text%3E%3C/svg%3E",
    ),
  ).toBe(false);
});

test("keeps each terminal Task execution as an independent Inbox result", () => {
  const fixture = data();
  fixture.tasks = [
    {
      id: "task-1",
      eventId: "77".repeat(32),
      title: "Research creator",
      description: "Compare audience and collaboration fit",
      status: "in-progress",
      priority: "high",
      assignee: agentPubkey,
      labels: [],
      archived: false,
      updatedAt: 1,
    },
  ];
  fixture.taskExecutions = [
    {
      id: "execution-1",
      eventId: "88".repeat(32),
      taskId: "task-1",
      assignee: agentPubkey,
      requester: userPubkey,
      status: "finished",
      message: "First result",
      updatedAt: 10,
    },
    {
      id: "execution-2",
      eventId: "99".repeat(32),
      taskId: "task-1",
      assignee: agentPubkey,
      requester: userPubkey,
      status: "cancelled",
      message: "Cancelled by user",
      updatedAt: 20,
    },
    {
      id: "execution-3",
      eventId: "aa".repeat(32),
      taskId: "task-1",
      assignee: agentPubkey,
      requester: userPubkey,
      status: "finished",
      message: "Latest result",
      updatedAt: 30,
    },
  ];

  const results = buildInboxEntries(fixture).filter(
    (entry) => entry.type === "task_result",
  );
  expect(results.map((entry) => entry.id)).toEqual([
    "task-execution:execution-3",
    "task-execution:execution-1",
  ]);
  expect(resolveInboxEntry(results, "88".repeat(32))?.id).toBe(
    "task-execution:execution-1",
  );
});
