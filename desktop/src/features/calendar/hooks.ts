import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { relayClient } from "@/shared/api/relayClient";
import { signRelayEvent } from "@/shared/api/tauri";
import { useIdentityQuery } from "@/shared/api/hooks";
import {
  useManagedAgentsQuery,
  useRelayAgentsQuery,
} from "@/features/agents/hooks";
import { mergeOwnedAgentPubkeys } from "@/features/agents/knownAgentPubkeys";
import { getUsersBatch } from "@/shared/api/tauriProfiles";
import type { RelayEvent } from "@/shared/api/types";
import {
  KIND_CALENDAR_DATE_EVENT,
  KIND_CALENDAR_TIME_EVENT,
  KIND_DELETION,
} from "@/shared/constants/kinds";
import type {
  CalendarDraft,
  CalendarEvent,
  CalendarRange,
} from "./lib/calendarTypes";

const EVENT_KINDS = [
  KIND_CALENDAR_DATE_EVENT,
  KIND_CALENDAR_TIME_EVENT,
] as const;

function tagValue(event: RelayEvent, name: string): string | undefined {
  return event.tags.find((tag) => tag[0] === name)?.[1];
}

function parseEvent(event: RelayEvent): CalendarEvent | null {
  const id = tagValue(event, "d");
  const title = tagValue(event, "title");
  const startValue = tagValue(event, "start");
  if (
    !id ||
    !title ||
    !startValue ||
    (event.kind !== 31922 && event.kind !== 31923)
  )
    return null;
  const allDay = event.kind === 31922;
  const start = allDay
    ? new Date(`${startValue}T00:00:00`)
    : new Date(Number(startValue) * 1_000);
  const rawEnd = tagValue(event, "end");
  const end = rawEnd
    ? allDay
      ? new Date(`${rawEnd}T00:00:00`)
      : new Date(Number(rawEnd) * 1_000)
    : new Date(start.getTime() + (allDay ? 86_400_000 : 1_800_000));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return {
    id,
    eventId: event.id,
    author: event.pubkey,
    title,
    description: event.content,
    location: tagValue(event, "location") ?? "",
    participants: event.tags
      .filter((tag) => tag[0] === "p" && tag[1])
      .map((tag) => tag[1]),
    calendarId:
      event.tags.find(
        (tag) => tag[0] === "a" && tag[1]?.startsWith("31924:"),
      )?.[1] ?? "personal",
    start,
    end,
    allDay,
    kind: event.kind,
    createdAt: event.created_at,
  };
}

function eventTags(draft: CalendarDraft): string[][] {
  const tags: string[][] = [
    ["d", draft.id],
    ["title", draft.title],
  ];
  if (draft.allDay) {
    const localDate = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };
    tags.push(["start", localDate(draft.start)], ["end", localDate(draft.end)]);
  } else {
    tags.push(
      ["start", String(Math.floor(draft.start.getTime() / 1_000))],
      ["end", String(Math.floor(draft.end.getTime() / 1_000))],
      ["start_tzid", Intl.DateTimeFormat().resolvedOptions().timeZone],
      ["end_tzid", Intl.DateTimeFormat().resolvedOptions().timeZone],
    );
    const startDay = Math.floor(draft.start.getTime() / 86_400_000);
    const endDay = Math.floor((draft.end.getTime() - 1) / 86_400_000);
    for (let day = startDay; day <= endDay; day += 1) {
      tags.push(["D", String(day)]);
    }
  }
  if (draft.location.trim()) tags.push(["location", draft.location.trim()]);
  for (const participant of draft.participants)
    if (participant.trim()) tags.push(["p", participant.trim()]);
  if (draft.calendarId !== "personal") tags.push(["a", draft.calendarId]);
  return tags;
}

async function publishDraft(draft: CalendarDraft): Promise<RelayEvent> {
  const event = await signRelayEvent({
    kind: draft.allDay ? KIND_CALENDAR_DATE_EVENT : KIND_CALENDAR_TIME_EVENT,
    content: draft.description,
    tags: eventTags(draft),
  });
  return relayClient.publishEvent(
    event,
    "Timed out saving calendar event.",
    "Failed to save calendar event.",
  );
}

export const calendarQueryKey = (pubkey: string) =>
  ["calendar-events", pubkey] as const;

export function useCalendar(range: CalendarRange) {
  const identity = useIdentityQuery();
  const pubkey = identity.data?.pubkey;
  const managedAgents = useManagedAgentsQuery().data;
  const relayAgents = useRelayAgentsQuery().data;
  const relayAgentProfiles = useQuery({
    enabled: Boolean(pubkey && relayAgents?.length),
    queryKey: [
      "calendar-agent-profiles",
      pubkey,
      ...(relayAgents ?? []).map((agent) => agent.pubkey).sort(),
    ],
    queryFn: () =>
      getUsersBatch((relayAgents ?? []).map((agent) => agent.pubkey)),
    staleTime: 30_000,
  });
  const ownedAgentPubkeys = React.useMemo(
    () =>
      mergeOwnedAgentPubkeys(
        managedAgents,
        relayAgentProfiles.data?.profiles,
        pubkey,
      ),
    [managedAgents, pubkey, relayAgentProfiles.data?.profiles],
  );
  const visibleAuthors = React.useMemo(
    () =>
      pubkey
        ? [pubkey, ...ownedAgentPubkeys].filter(
            (value, index, all) => all.indexOf(value) === index,
          )
        : [],
    [ownedAgentPubkeys, pubkey],
  );
  const authorLabels = React.useMemo(() => {
    const labels: Record<string, string> = {};
    for (const agent of managedAgents ?? []) labels[agent.pubkey] = agent.name;
    for (const agent of relayAgents ?? []) labels[agent.pubkey] = agent.name;
    return labels;
  }, [managedAgents, relayAgents]);
  const queryClient = useQueryClient();
  const query = useQuery({
    enabled: Boolean(pubkey) && !relayAgentProfiles.isLoading,
    queryKey: [
      ...calendarQueryKey(pubkey ?? ""),
      range.start.getTime(),
      range.end.getTime(),
      ...visibleAuthors,
    ],
    queryFn: async () => {
      // Event occurrence time is independent of created_at. Page all of the
      // author's heads before applying the visible window locally; the relay's
      // calendar projection can replace this with a native range filter later.
      const pageSize = 500;
      const byEventId = new Map<string, RelayEvent>();
      let until: number | undefined;
      for (;;) {
        const batch = await relayClient.fetchEvents({
          kinds: [...EVENT_KINDS],
          authors: visibleAuthors,
          limit: pageSize,
          ...(until === undefined ? {} : { until }),
        });
        for (const event of batch) byEventId.set(event.id, event);
        if (batch.length < pageSize) break;
        const oldest = Math.min(...batch.map((event) => event.created_at));
        until = oldest - 1;
      }
      const events = [...byEventId.values()];
      const heads = new Map<string, CalendarEvent>();
      for (const raw of events) {
        const event = parseEvent(raw);
        if (!event) continue;
        const current = heads.get(`${event.kind}:${event.id}`);
        if (!current || current.createdAt < event.createdAt)
          heads.set(`${event.kind}:${event.id}`, event);
      }
      return [...heads.values()];
    },
  });
  React.useEffect(() => {
    if (!pubkey) return;
    let dispose: (() => void) | undefined;
    void relayClient
      .subscribeLive(
        {
          kinds: [...EVENT_KINDS, KIND_DELETION],
          authors: visibleAuthors,
          limit: 0,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: calendarQueryKey(pubkey),
          });
        },
      )
      .then((next) => {
        dispose = next;
      });
    return () => dispose?.();
  }, [pubkey, queryClient, visibleAuthors]);
  const events = (query.data ?? []).filter(
    (event) => event.start < range.end && event.end > range.start,
  );
  const save = useMutation({
    mutationFn: publishDraft,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: calendarQueryKey(pubkey ?? ""),
      }),
  });
  const remove = useMutation({
    mutationFn: async (event: CalendarEvent) => {
      const deletion = await signRelayEvent({
        kind: KIND_DELETION,
        content: "Calendar event deleted",
        tags: [
          ["a", `${event.kind}:${event.author}:${event.id}`],
          ["k", String(event.kind)],
        ],
      });
      return relayClient.publishEvent(
        deletion,
        "Timed out deleting calendar event.",
        "Failed to delete calendar event.",
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: calendarQueryKey(pubkey ?? ""),
      }),
  });
  return { ...query, events, pubkey, authorLabels, save, remove };
}
