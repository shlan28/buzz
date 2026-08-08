import type { NostrEvent } from "@/shared/lib/nostr-client";
import { KINDS } from "@/shared/domain/eventKinds";
import { firstTag, semanticTag } from "@/shared/domain/eventTags";
import type { Track } from "./types";

export function parseTrack(event: NostrEvent): Track | null {
  if (event.kind !== KINDS.trackState) return null;
  const id = firstTag(event.tags, "d");
  const name = firstTag(event.tags, "title")?.trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    description: event.content,
    owner: firstTag(event.tags, "p"),
    members: event.tags
      .filter((tag) => tag[0] === "member" && tag[1])
      .map((tag) => tag[1]),
    startDate: firstTag(event.tags, "start_date"),
    endDate: firstTag(event.tags, "end_date"),
    status: semanticTag(event.tags, "track-status:") ?? "planned",
    archived: firstTag(event.tags, "archived") === "true",
    updatedAt: event.created_at,
  };
}
