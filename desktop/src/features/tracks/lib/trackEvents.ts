import type { RelayEvent } from "@/shared/api/types";
import {
  KIND_TRACK_CREATE,
  KIND_TRACK_MUTATE,
  KIND_TRACK_STATE,
} from "@/shared/constants/kinds";
import type { Track, TrackDraft, TrackPatch, TrackStatus } from "../types";

const TRACK_STATUSES = new Set<TrackStatus>([
  "planned",
  "active",
  "completed",
  "canceled",
]);

function firstTag(event: RelayEvent, name: string) {
  return event.tags.find((tag) => tag[0] === name)?.[1];
}

function semanticTag(event: RelayEvent, prefix: string) {
  return event.tags
    .filter((tag) => tag[0] === "t")
    .map((tag) => tag[1] ?? "")
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

export function parseTrackState(
  event: RelayEvent,
  relaySelfPubkey: string,
): Track | null {
  if (
    event.kind !== KIND_TRACK_STATE ||
    event.pubkey.toLowerCase() !== relaySelfPubkey.toLowerCase()
  ) {
    return null;
  }

  const id = firstTag(event, "d");
  const name = firstTag(event, "title")?.trim();
  const owner = firstTag(event, "p");
  const startDate = firstTag(event, "start_date");
  const endDate = firstTag(event, "end_date");
  const rawStatus = semanticTag(event, "track-status:");
  const rawArchived = firstTag(event, "archived");
  const rawMembers = event.tags
    .filter((tag) => tag[0] === "member")
    .map((tag) => tag[1] ?? "");
  if (
    !id ||
    !isUuid(id) ||
    !name ||
    !owner ||
    !/^[0-9a-f]{64}$/i.test(owner) ||
    rawMembers.some((member) => !/^[0-9a-f]{64}$/i.test(member)) ||
    !isDateOnly(startDate) ||
    !isDateOnly(endDate) ||
    startDate > endDate ||
    !TRACK_STATUSES.has(rawStatus as TrackStatus) ||
    (rawArchived !== "true" && rawArchived !== "false")
  ) {
    return null;
  }

  return {
    id,
    eventId: event.id,
    name,
    description: event.content,
    owner,
    members: uniqueMembers(rawMembers, owner),
    startDate,
    endDate,
    status: rawStatus as TrackStatus,
    archived: rawArchived === "true",
    creator: firstTag(event, "creator") ?? event.pubkey,
    lastEditor: firstTag(event, "last_editor") ?? event.pubkey,
    createdAt: parseTimestamp(firstTag(event, "created_at"), event.created_at),
    updatedAt: event.created_at,
    canRead: true,
    canManage: false,
  };
}

export function buildCreateTrackEvent(draft: TrackDraft) {
  validateTrackDraft(draft);
  if (!isUuid(draft.id)) throw new Error("Track id must be a UUID.");
  return {
    kind: KIND_TRACK_CREATE as typeof KIND_TRACK_CREATE,
    content: draft.description,
    tags: trackFieldTags(draft),
  };
}

export function buildMutateTrackEvent(track: Track, patch: TrackPatch) {
  if (Object.keys(patch).length === 0) {
    throw new Error("Track update does not contain any changes.");
  }
  const next = { ...track, ...patch };
  validateTrackDraft(next);
  if (next.archived && !isArchivableStatus(next.status)) {
    throw new Error("Only completed or canceled tracks can be archived.");
  }

  const tags: string[][] = [
    ["t", `track-id:${track.id}`],
    ["action", "update"],
    ["previous", track.eventId],
    ["e", track.eventId, "", "previous"],
  ];
  if (patch.name !== undefined) tags.push(["title", patch.name.trim()]);
  if (patch.owner !== undefined) tags.push(["p", patch.owner]);
  if (patch.members !== undefined) {
    tags.push(["clear", "members"]);
    for (const member of uniqueMembers(patch.members, next.owner)) {
      tags.push(["member", member]);
    }
  }
  if (patch.startDate !== undefined) tags.push(["start_date", patch.startDate]);
  if (patch.endDate !== undefined) tags.push(["end_date", patch.endDate]);
  if (patch.status !== undefined)
    tags.push(["t", `track-status:${patch.status}`]);
  if (patch.description !== undefined)
    tags.push([patch.description.length > 0 ? "set" : "clear", "description"]);
  if (patch.archived !== undefined)
    tags.push(["archived", String(patch.archived)]);

  return {
    kind: KIND_TRACK_MUTATE as typeof KIND_TRACK_MUTATE,
    content: patch.description ?? "",
    tags,
  };
}

export function validateTrackDraft(
  draft: Pick<
    TrackDraft,
    "name" | "owner" | "members" | "startDate" | "endDate" | "status"
  > & { description?: string },
) {
  const nameBytes = new TextEncoder().encode(draft.name.trim()).length;
  if (nameBytes < 1 || nameBytes > 256) {
    throw new Error("Track name must be between 1 and 256 bytes.");
  }
  if (!/^[0-9a-f]{64}$/i.test(draft.owner)) {
    throw new Error("Track owner must be a 64-character public key.");
  }
  if (draft.members.some((member) => !/^[0-9a-f]{64}$/i.test(member))) {
    throw new Error("Every Track member must be a 64-character public key.");
  }
  if (
    draft.description !== undefined &&
    new TextEncoder().encode(draft.description).length > 65_536
  ) {
    throw new Error("Track description must be at most 65536 bytes.");
  }
  if (!isDateOnly(draft.startDate) || !isDateOnly(draft.endDate)) {
    throw new Error("Start and end dates must use YYYY-MM-DD.");
  }
  if (draft.endDate < draft.startDate) {
    throw new Error("End date cannot be before start date.");
  }
  if (!TRACK_STATUSES.has(draft.status)) {
    throw new Error("Track status is invalid.");
  }
}

export function isArchivableStatus(status: TrackStatus) {
  return status === "completed" || status === "canceled";
}

function trackFieldTags(draft: TrackDraft): string[][] {
  return [
    ["t", `track-id:${draft.id}`],
    ["title", draft.name.trim()],
    ["p", draft.owner],
    ...uniqueMembers(draft.members, draft.owner).map((member) => [
      "member",
      member,
    ]),
    ["start_date", draft.startDate],
    ["end_date", draft.endDate],
    ["t", `track-status:${draft.status}`],
    ["archived", "false"],
  ];
}

export function uniqueMembers(members: readonly string[], owner?: string) {
  const ownerKey = owner?.toLowerCase();
  const seen = new Set<string>();
  const result: string[] = [];
  for (const member of members) {
    const value = member.trim();
    const normalized = value.toLowerCase();
    if (
      !/^[0-9a-f]{64}$/i.test(value) ||
      normalized === ownerKey ||
      seen.has(normalized)
    ) {
      continue;
    }
    seen.add(normalized);
    result.push(value);
  }
  return result;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isDateOnly(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseTimestamp(value: string | undefined, fallback: number) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}
