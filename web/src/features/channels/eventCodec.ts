import type { NostrEvent } from "@/shared/lib/nostr-client";
import { KINDS, MESSAGE_KINDS } from "@/shared/domain/eventKinds";
import { firstTag } from "@/shared/domain/eventTags";
import type { Channel, Message } from "./types";

export function parseChannel(event: NostrEvent): Channel | null {
  if (event.kind !== KINDS.channelMetadata) return null;
  const id = firstTag(event.tags, "d");
  const name = firstTag(event.tags, "name")?.trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    about: firstTag(event.tags, "about") ?? event.content,
    channelType:
      firstTag(event.tags, "t") === "dm" ||
      event.tags.some((tag) => tag[0] === "hidden")
        ? "dm"
        : firstTag(event.tags, "t") === "forum"
          ? "forum"
          : "stream",
    visibility:
      firstTag(event.tags, "visibility") === "private" ||
      event.tags.some((tag) => tag[0] === "private")
        ? "private"
        : "open",
    participantPubkeys: event.tags
      .filter((tag) => tag[0] === "p" && tag[1])
      .map((tag) => tag[1]),
    updatedAt: event.created_at,
  };
}

export function parseMessage(event: NostrEvent): Message | null {
  if (!MESSAGE_KINDS.some((kind) => kind === event.kind)) return null;
  const channelId = firstTag(event.tags, "h");
  if (!channelId) return null;
  return {
    id: event.id,
    channelId,
    author: event.pubkey,
    content: event.content,
    createdAt: event.created_at,
  };
}
