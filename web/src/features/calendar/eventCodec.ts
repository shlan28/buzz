import type { NostrEvent } from "@/shared/lib/nostr-client";
import { KINDS } from "@/shared/domain/eventKinds";
import { firstTag } from "@/shared/domain/eventTags";
import type { CalendarItem } from "./types";

export function parseCalendarItem(event: NostrEvent): CalendarItem | null {
  if (event.kind !== KINDS.calendarDate && event.kind !== KINDS.calendarTime)
    return null;
  const id = firstTag(event.tags, "d");
  const title = firstTag(event.tags, "title")?.trim();
  const startValue = firstTag(event.tags, "start");
  if (!id || !title || !startValue) return null;
  const allDay = event.kind === KINDS.calendarDate;
  const parse = (value: string) =>
    allDay ? new Date(`${value}T00:00:00`) : new Date(Number(value) * 1000);
  const start = parse(startValue);
  const endValue = firstTag(event.tags, "end");
  const end = endValue ? parse(endValue) : undefined;
  if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime())))
    return null;
  return {
    id,
    title,
    description: event.content,
    start,
    end,
    allDay,
    location: firstTag(event.tags, "location"),
    author: event.pubkey,
    updatedAt: event.created_at,
  };
}
