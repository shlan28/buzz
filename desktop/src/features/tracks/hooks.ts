import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useManagedAgentsQuery,
  useRelayAgentsQuery,
} from "@/features/agents/hooks";
import { useRelayMembersQuery } from "@/features/community-members/hooks";
import { useRelaySelfQuery } from "@/features/moderation/hooks";
import { useUsersBatchQuery } from "@/features/profile/hooks";
import { useIdentityQuery } from "@/shared/api/hooks";
import { relayClient } from "@/shared/api/relayClient";
import { signRelayEvent } from "@/shared/api/tauri";
import type { RelayEvent } from "@/shared/api/types";
import {
  type KIND_TRACK_CREATE,
  type KIND_TRACK_MUTATE,
  KIND_TRACK_STATE,
} from "@/shared/constants/kinds";
import { truncatePubkey } from "@/shared/lib/pubkey";
import {
  buildCreateTrackEvent,
  buildMutateTrackEvent,
  parseTrackState,
} from "./lib/trackEvents";
import type { Track, TrackDraft, TrackOwnerOption, TrackPatch } from "./types";

export const tracksQueryKey = ["tracks"] as const;

async function fetchTracks(relaySelfPubkey: string): Promise<Track[]> {
  const pageSize = 500;
  const byId = new Map<string, Track>();
  let until: number | undefined;
  for (;;) {
    const events = await relayClient.fetchEvents({
      kinds: [KIND_TRACK_STATE],
      limit: pageSize,
      ...(until === undefined ? {} : { until }),
    });
    for (const event of events) {
      const track = parseTrackState(event, relaySelfPubkey);
      if (!track) continue;
      const current = byId.get(track.id);
      if (!current || current.updatedAt < track.updatedAt) {
        byId.set(track.id, track);
      }
    }
    if (events.length < pageSize) break;
    until = Math.min(...events.map((event) => event.created_at)) - 1;
  }
  return [...byId.values()];
}

async function publishTrackCommand(input: {
  kind: typeof KIND_TRACK_CREATE | typeof KIND_TRACK_MUTATE;
  content: string;
  tags: string[][];
}) {
  const event = await signRelayEvent(input);
  return relayClient.publishEvent(
    event,
    "Timed out saving track.",
    "Failed to save track.",
  );
}

export function useTracks() {
  const queryClient = useQueryClient();
  const identity = useIdentityQuery();
  const relaySelf = useRelaySelfQuery();
  const members = useRelayMembersQuery();
  const managedAgents = useManagedAgentsQuery();
  const relayAgents = useRelayAgentsQuery();
  const memberPubkeys = React.useMemo(
    () => [
      ...new Set([
        ...(members.data ?? []).map((member) => member.pubkey),
        ...(identity.data?.pubkey ? [identity.data.pubkey] : []),
      ]),
    ],
    [identity.data?.pubkey, members.data],
  );
  const profiles = useUsersBatchQuery(memberPubkeys);
  const query = useQuery({
    enabled: Boolean(relaySelf.data),
    queryKey: [...tracksQueryKey, relaySelf.data ?? null],
    queryFn: () => fetchTracks(relaySelf.data ?? ""),
  });

  React.useEffect(() => {
    let disposed = false;
    let dispose: (() => void) | undefined;
    void relayClient
      .subscribeLive(
        { kinds: [KIND_TRACK_STATE], limit: 0 },
        (_event: RelayEvent) => {
          void queryClient.invalidateQueries({ queryKey: tracksQueryKey });
        },
      )
      .then((nextDispose) => {
        if (disposed) nextDispose();
        else dispose = nextDispose;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      dispose?.();
    };
  }, [queryClient]);

  const owners = React.useMemo<TrackOwnerOption[]>(() => {
    const managedByPubkey = new Map(
      (managedAgents.data ?? []).map((agent) => [
        agent.pubkey.toLowerCase(),
        agent.name,
      ]),
    );
    const relayByPubkey = new Map(
      (relayAgents.data ?? []).map((agent) => [
        agent.pubkey.toLowerCase(),
        agent.name,
      ]),
    );
    const seen = new Set<string>();
    const result: TrackOwnerOption[] = [];
    for (const member of members.data ?? []) {
      const normalized = member.pubkey.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      const managedName = managedByPubkey.get(normalized);
      const relayName = relayByPubkey.get(normalized);
      const profile = profiles.data?.profiles[normalized];
      result.push({
        pubkey: member.pubkey,
        label:
          profile?.displayName ??
          managedName ??
          relayName ??
          truncatePubkey(member.pubkey),
        kind:
          managedName || relayName || profile?.ownerPubkey ? "agent" : "person",
      });
    }
    for (const agent of [
      ...(managedAgents.data ?? []),
      ...(relayAgents.data ?? []),
    ]) {
      const normalized = agent.pubkey.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      result.push({
        pubkey: agent.pubkey,
        label: agent.name || truncatePubkey(agent.pubkey),
        kind: "agent",
      });
    }
    return result.sort((left, right) => {
      if (left.pubkey === identity.data?.pubkey) return -1;
      if (right.pubkey === identity.data?.pubkey) return 1;
      return left.label.localeCompare(right.label);
    });
  }, [
    identity.data?.pubkey,
    managedAgents.data,
    members.data,
    profiles.data?.profiles,
    relayAgents.data,
  ]);

  const tracks = React.useMemo(() => {
    const viewer = identity.data?.pubkey.toLowerCase();
    const viewerOwner = viewer
      ? profiles.data?.profiles[viewer]?.ownerPubkey?.toLowerCase()
      : undefined;
    return (query.data ?? []).map((track) => ({
      ...track,
      canRead: true,
      canManage:
        Boolean(viewer) &&
        (track.owner.toLowerCase() === viewer ||
          track.owner.toLowerCase() === viewerOwner),
    }));
  }, [identity.data?.pubkey, profiles.data?.profiles, query.data]);

  const create = useMutation({
    mutationFn: (draft: TrackDraft) =>
      publishTrackCommand(buildCreateTrackEvent(draft)),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: tracksQueryKey }),
  });
  const update = useMutation({
    mutationFn: ({ track, patch }: { track: Track; patch: TrackPatch }) =>
      publishTrackCommand(buildMutateTrackEvent(track, patch)),
    onMutate: async ({ track, patch }) => {
      await queryClient.cancelQueries({ queryKey: tracksQueryKey });
      const snapshots = queryClient.getQueriesData<Track[]>({
        queryKey: tracksQueryKey,
      });
      queryClient.setQueriesData<Track[]>({ queryKey: tracksQueryKey }, (old) =>
        old?.map((item) =>
          item.id === track.id ? { ...item, ...patch } : item,
        ),
      );
      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      for (const [key, value] of context?.snapshots ?? []) {
        queryClient.setQueryData(key, value);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tracksQueryKey });
    },
  });

  return {
    tracks,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    create,
    update,
    owners,
    currentPubkey: identity.data?.pubkey,
  };
}
