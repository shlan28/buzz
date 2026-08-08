import type { Message } from "@/features/channels/types";
import { profileLabel } from "@/features/profile/eventCodec";
import type { WorkConsoleData } from "@/shared/api/communitySession";
import { KINDS } from "@/shared/domain/eventKinds";

export type InboxCategory = "dm" | "mention" | "thread" | "agent" | "channel";

export type InboxEntry = {
  id: string;
  conversationId: string;
  message: Message;
  messages: Message[];
  authorLabel: string;
  avatarUrl?: string | null;
  isAgent: boolean;
  category: InboxCategory;
  categoryText: string;
  channelLabel: string;
  canOpenConversation: boolean;
  preview: string;
};

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

  return [...groups.entries()]
    .map(([conversationId, unsortedMessages]) => {
      const messages = [...unsortedMessages].sort(compareMessages);
      const message = messages[messages.length - 1] as Message;
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
        id: conversationId,
        conversationId,
        message,
        messages,
        authorLabel,
        avatarUrl: profile?.avatarUrl,
        isAgent: profile?.isAgent === true,
        category,
        categoryText: categoryText(category, authorLabel, channelLabel),
        channelLabel,
        canOpenConversation: Boolean(channel),
        preview: message.content,
      };
    })
    .sort((left, right) => compareMessages(right.message, left.message))
    .slice(0, 100);
}

export function resolveInboxEntry(entries: InboxEntry[], id?: string) {
  if (!id) return undefined;
  return entries.find(
    (entry) =>
      entry.conversationId === id ||
      entry.messages.some((message) => message.id === id),
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
  }
}

function compareMessages(left: Message, right: Message) {
  return left.createdAt - right.createdAt || left.id.localeCompare(right.id);
}
