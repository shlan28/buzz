import * as React from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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
  CalendarSource,
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

async function fetchCalendarSource(author: string): Promise<CalendarEvent[]> {
  // Event occurrence time is independent of created_at. Page all of this
  // author's heads before applying the visible window locally; the relay's
  // calendar projection can replace this with a native range filter later.
  const pageSize = 500;
  const byEventId = new Map<string, RelayEvent>();
  let until: number | undefined;
  for (;;) {
    const batch = await relayClient.fetchEvents({
      kinds: [...EVENT_KINDS],
      authors: [author],
      limit: pageSize,
      ...(until === undefined ? {} : { until }),
    });
    for (const event of batch) byEventId.set(event.id, event);
    if (batch.length < pageSize) break;
    const oldest = Math.min(...batch.map((event) => event.created_at));
    until = oldest - 1;
  }
  const heads = new Map<string, CalendarEvent>();
  for (const raw of byEventId.values()) {
    const event = parseEvent(raw);
    if (!event) continue;
    const current = heads.get(`${event.kind}:${event.id}`);
    if (!current || current.createdAt < event.createdAt) {
      heads.set(`${event.kind}:${event.id}`, event);
    }
  }
  return [...heads.values()];
}

export function useCalendar(range: CalendarRange) {
  const identity = useIdentityQuery();
  const pubkey = identity.data?.pubkey;
  const managedAgents = useManagedAgentsQuery().data;
  const relayAgents = useRelayAgentsQuery().data;
  const profileCandidatePubkeys = React.useMemo(
    () => [
      ...new Set(
        [...(managedAgents ?? []), ...(relayAgents ?? [])]
          .map((agent) => agent.pubkey.trim().toLowerCase())
          .filter((candidate) => /^[0-9a-f]{64}$/.test(candidate)),
      ),
    ],
    [managedAgents, relayAgents],
  );
  const relayAgentProfiles = useQuery({
    enabled: Boolean(pubkey && profileCandidatePubkeys.length),
    queryKey: [
      "calendar-agent-profiles",
      pubkey,
      ...[...profileCandidatePubkeys].sort(),
    ],
    queryFn: () => getUsersBatch(profileCandidatePubkeys),
    staleTime: 30_000,
  });
  const ownedAgentPubkeys = React.useMemo(
    () =>
      mergeOwnedAgentPubkeys(
        undefined,
        relayAgentProfiles.data?.profiles,
        pubkey,
      ),
    [pubkey, relayAgentProfiles.data?.profiles],
  );
  const authorLabels = React.useMemo(() => {
    const labels: Record<string, string> = {};
    for (const agent of managedAgents ?? []) labels[agent.pubkey] = agent.name;
    for (const agent of relayAgents ?? []) labels[agent.pubkey] = agent.name;
    return labels;
  }, [managedAgents, relayAgents]);
  const sourceDefinitions = React.useMemo(
    () =>
      pubkey
        ? [
            { pubkey, label: "Personal", kind: "personal" as const },
            ...[...ownedAgentPubkeys].map((agentPubkey) => ({
              pubkey: agentPubkey,
              label: authorLabels[agentPubkey] ?? agentPubkey,
              kind: "agent" as const,
            })),
          ]
        : [],
    [authorLabels, ownedAgentPubkeys, pubkey],
  );
  const [disabledSources, setDisabledSources] = React.useState<
    ReadonlySet<string>
  >(() => new Set());
  const enabledAuthors = React.useMemo(
    () =>
      sourceDefinitions
        .filter((source) => !disabledSources.has(source.pubkey))
        .map((source) => source.pubkey),
    [disabledSources, sourceDefinitions],
  );
  const queryClient = useQueryClient();
  const sourceQueries = useQueries({
    queries: sourceDefinitions.map((source) => ({
      enabled: !disabledSources.has(source.pubkey),
      queryKey: [...calendarQueryKey(pubkey ?? ""), "source", source.pubkey],
      queryFn: () => fetchCalendarSource(source.pubkey),
    })),
  });
  React.useEffect(() => {
    if (!pubkey) return;
    let cancelled = false;
    const disposers: Array<() => void> = [];
    for (const author of enabledAuthors) {
      void relayClient
        .subscribeLive(
          {
            kinds: [...EVENT_KINDS, KIND_DELETION],
            authors: [author],
            limit: 0,
          },
          (event) => {
            if (event.kind === KIND_DELETION) {
              const coordinate = tagValue(event, "a")?.split(":") ?? [];
              const [kind, targetAuthor, ...idParts] = coordinate;
              const id = idParts.join(":");
              if (kind && targetAuthor && id) {
                queryClient.setQueriesData<CalendarEvent[]>(
                  { queryKey: calendarQueryKey(pubkey) },
                  (current) =>
                    current?.filter(
                      (calendarEvent) =>
                        String(calendarEvent.kind) !== kind ||
                        calendarEvent.author !== targetAuthor ||
                        calendarEvent.id !== id,
                    ),
                );
              }
              return;
            }
            void queryClient.invalidateQueries({
              queryKey: [...calendarQueryKey(pubkey), "source", author],
            });
          },
        )
        .then((dispose) => {
          if (cancelled) dispose();
          else disposers.push(dispose);
        })
        .catch(() => {
          // The corresponding history query owns the user-visible source
          // error. A failed live subscription must not disable other sources.
        });
    }
    return () => {
      cancelled = true;
      for (const dispose of disposers) dispose();
    };
  }, [enabledAuthors, pubkey, queryClient]);
  const sources: CalendarSource[] = sourceDefinitions.map((source, index) => {
    const query = sourceQueries[index];
    const enabled = !disabledSources.has(source.pubkey);
    const status: CalendarSource["status"] = !enabled
      ? "idle"
      : query?.isError
        ? "error"
        : query?.isLoading
          ? "loading"
          : "ready";
    return { ...source, enabled, status };
  });
  const events = sourceQueries
    .flatMap((query, index) =>
      sources[index]?.enabled ? (query.data ?? []) : [],
    )
    .filter((event) => event.start < range.end && event.end > range.start);
  const personalIndex = sourceDefinitions.findIndex(
    (source) => source.kind === "personal",
  );
  const personalQuery = sourceQueries[personalIndex];
  const personalEnabled = Boolean(sources[personalIndex]?.enabled);
  const isLoading = personalEnabled && Boolean(personalQuery?.isLoading);
  const isFetching = sourceQueries.some(
    (query, index) => sources[index]?.enabled && query.isFetching,
  );
  const isError = personalEnabled && Boolean(personalQuery?.isError);
  const refetch = () => personalQuery?.refetch();
  const toggleSource = (sourcePubkey: string) => {
    setDisabledSources((current) => {
      const next = new Set(current);
      if (next.has(sourcePubkey)) next.delete(sourcePubkey);
      else next.add(sourcePubkey);
      return next;
    });
  };
  const retrySource = (sourcePubkey: string) => {
    const index = sourceDefinitions.findIndex(
      (source) => source.pubkey === sourcePubkey,
    );
    return sourceQueries[index]?.refetch();
  };
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
    onMutate: async (event) => {
      const queryKey = calendarQueryKey(pubkey ?? "");
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData<CalendarEvent[]>({
        queryKey,
      });
      queryClient.setQueriesData<CalendarEvent[]>({ queryKey }, (current) =>
        current?.filter(
          (calendarEvent) =>
            calendarEvent.kind !== event.kind ||
            calendarEvent.author !== event.author ||
            calendarEvent.id !== event.id,
        ),
      );
      return { previous };
    },
    onError: (_error, _event, context) => {
      for (const [queryKey, data] of context?.previous ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
    },
  });
  return {
    events,
    pubkey,
    authorLabels,
    sources,
    sourcesLoading: relayAgentProfiles.isLoading,
    toggleSource,
    retrySource,
    isLoading,
    isFetching,
    isError,
    refetch,
    save,
    remove,
  };
}
