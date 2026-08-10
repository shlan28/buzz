import type { Message } from "@/features/channels/types";
import { profileLabel } from "@/features/profile/eventCodec";
import type { Task, TaskExecution } from "@/features/tasks/types";
import type { WorkConsoleData } from "@/shared/api/communitySession";
import { KINDS } from "@/shared/domain/eventKinds";

export type InboxCategory =
  | "dm"
  | "mention"
  | "thread"
  | "agent"
  | "channel"
  | "task_result";

type InboxEntryBase = {
  id: string;
  conversationId: string;
  authorLabel: string;
  avatarUrl?: string | null;
  isAgent: boolean;
  category: InboxCategory;
  categoryText: string;
  channelLabel: string;
  canOpenConversation: boolean;
  preview: string;
  updatedAt: number;
};

export type MessageInboxEntry = InboxEntryBase & {
  type: "message";
  message: Message;
  messages: Message[];
};

export type TaskResultInboxEntry = InboxEntryBase & {
  type: "task_result";
  execution: TaskExecution;
  task: Task;
};

export type InboxEntry = MessageInboxEntry | TaskResultInboxEntry;

export function buildInboxEntries(data: WorkConsoleData): InboxEntry[] {
  const channelById = new Map(
    data.channels.map((channel) => [channel.id, channel]),
  );
  const groups = new Map<string, Message[]>();
  for (const message of data.messages) {
    const channel = channelById.get(message.channelId);
    const threadRoot = messageThreadRoot(message);
    const conversationId =
      channel?.channelType === "dm"
        ? `dm:${message.channelId}`
        : threadRoot
          ? `thread:${message.channelId}:${threadRoot}`
          : `message:${message.id}`;
    groups.set(conversationId, [
      ...(groups.get(conversationId) ?? []),
      message,
    ]);
  }

  const messageEntries = [...groups.entries()]
    .map<MessageInboxEntry | null>(([conversationId, unsortedMessages]) => {
      const messages = [...unsortedMessages].sort(compareMessages);
      const candidates = messages.filter(
        (item) => item.author.toLowerCase() !== data.userPubkey.toLowerCase(),
      );
      const message = candidates[candidates.length - 1];
      if (!message) return null;
      const profile = data.profilesByPubkey[message.author.toLowerCase()];
      const channel = channelById.get(message.channelId);
      const authorLabel = profileLabel(profile, message.author);
      const channelLabel = channel?.displayName ?? "Unavailable conversation";
      const category = inboxCategory(
        message,
        data,
        channel?.channelType === "dm",
        conversationId.startsWith("thread:"),
      );
      return {
        type: "message",
        id: conversationId,
        conversationId,
        message,
        messages,
        authorLabel,
        avatarUrl: profile?.avatarUrl ?? null,
        isAgent: profile?.isAgent === true,
        category,
        categoryText: categoryText(category, authorLabel, channelLabel),
        channelLabel,
        canOpenConversation: Boolean(channel),
        preview: message.content,
        updatedAt: message.createdAt,
      };
    })
    .filter((entry): entry is MessageInboxEntry => entry !== null);

  const tasksById = new Map(data.tasks.map((task) => [task.id, task]));
  const viewer = data.userPubkey.toLowerCase();
  const taskEntries = data.taskExecutions.flatMap(
    (execution): TaskResultInboxEntry[] => {
      if (execution.status !== "finished" && execution.status !== "failed") {
        return [];
      }
      const requester = execution.requester.toLowerCase();
      const owner = execution.owner?.toLowerCase();
      if (requester !== viewer && owner !== viewer) return [];
      const task = tasksById.get(execution.taskId);
      if (!task) return [];
      const profile = data.profilesByPubkey[execution.assignee.toLowerCase()];
      const authorLabel = profileLabel(profile, execution.assignee);
      return [
        {
          type: "task_result",
          id: `task-execution:${execution.id}`,
          conversationId: `task-execution:${execution.id}`,
          execution,
          task,
          authorLabel,
          avatarUrl: profile?.avatarUrl ?? null,
          isAgent: true,
          category: "task_result",
          categoryText:
            execution.status === "finished" ? "Task completed" : "Task failed",
          channelLabel: "Tasks",
          canOpenConversation: false,
          preview:
            execution.message.trim() ||
            (execution.status === "finished"
              ? "The Agent completed this task without a text summary."
              : "The Agent did not provide additional failure details."),
          updatedAt: execution.updatedAt,
        },
      ];
    },
  );

  return [...messageEntries, ...taskEntries]
    .sort(
      (left, right) =>
        right.updatedAt - left.updatedAt || left.id.localeCompare(right.id),
    )
    .slice(0, 100);
}

export function resolveInboxEntry(entries: InboxEntry[], id?: string) {
  if (!id) return undefined;
  return entries.find(
    (entry) =>
      entry.conversationId === id ||
      (entry.type === "message" &&
        entry.messages.some((message) => message.id === id)) ||
      (entry.type === "task_result" && entry.execution.eventId === id),
  );
}

export function messageThreadRoot(message: Pick<Message, "tags">) {
  const eventTags = message.tags.filter((tag) => tag[0] === "e" && tag[1]);
  return (
    eventTags.find((tag) => tag[3] === "root")?.[1] ??
    eventTags.find((tag) => tag[3] === "reply")?.[1] ??
    null
  );
}

function inboxCategory(
  message: Message,
  data: WorkConsoleData,
  isDm: boolean,
  isThread: boolean,
): InboxCategory {
  if (isDm) return "dm";
  if (
    message.tags.some(
      (tag) =>
        tag[0] === "p" &&
        tag[1]?.toLowerCase() === data.userPubkey.toLowerCase(),
    )
  )
    return "mention";
  if (isThread) return "thread";
  if (
    message.kind === KINDS.agentMessage ||
    data.profilesByPubkey[message.author.toLowerCase()]?.isAgent
  )
    return "agent";
  return "channel";
}

function categoryText(
  category: InboxCategory,
  author: string,
  channel: string,
) {
  switch (category) {
    case "dm":
      return `DM from ${author}`;
    case "mention":
      return `Mentioned in #${channel}`;
    case "thread":
      return `Thread in #${channel}`;
    case "agent":
      return `Agent update in #${channel}`;
    case "channel":
      return `Channel update in #${channel}`;
    case "task_result":
      return "Task result";
  }
}

function compareMessages(left: Message, right: Message) {
  return left.createdAt - right.createdAt || left.id.localeCompare(right.id);
}
