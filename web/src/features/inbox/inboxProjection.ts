import { profileLabel } from "@/features/profile/eventCodec";
import type { WorkConsoleData } from "@/shared/api/communitySession";
import type { Message } from "@/features/channels/types";

export type InboxEntry = {
  id: string;
  message: Message;
  authorLabel: string;
  avatarUrl?: string | null;
  isAgent: boolean;
  channelLabel: string;
  canOpenConversation: boolean;
  preview: string;
};

export function buildInboxEntries(data: WorkConsoleData): InboxEntry[] {
  const channelById = new Map(
    data.channels.map((channel) => [channel.id, channel]),
  );
  return [...data.messages]
    .sort(
      (left, right) =>
        right.createdAt - left.createdAt || right.id.localeCompare(left.id),
    )
    .slice(0, 100)
    .map((message) => {
      const profile = data.profilesByPubkey[message.author.toLowerCase()];
      const channel = channelById.get(message.channelId);
      return {
        id: message.id,
        message,
        authorLabel: profileLabel(profile, message.author),
        avatarUrl: profile?.avatarUrl,
        isAgent: profile?.isAgent === true,
        channelLabel: channel?.displayName ?? "Unavailable conversation",
        canOpenConversation: Boolean(channel),
        preview: markdownPreview(message.content),
      };
    });
}

export function inboxContext(data: WorkConsoleData, entry: InboxEntry) {
  return data.messages.filter(
    (message) => message.channelId === entry.message.channelId,
  );
}

export function markdownPreview(content: string) {
  return content
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\n?/g, ""))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+\.)\s+/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
